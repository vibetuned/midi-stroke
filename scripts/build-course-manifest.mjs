/**
 * Generate public/courses_files.json by scanning the course content that is
 * actually in public/courses/. Each course is a folder of numbered modules;
 * a module holds videos/*.mp4 plus exercises/<type>/<exercise-id>/ folders
 * containing exercise.yaml + worksheet.musicxml + answer.musicxml.
 *
 * The exercise.yaml metadata (title, instructions, key, …) is embedded into
 * the manifest so the app never needs a YAML parser at runtime. The report
 * flags any exercise whose worksheet/answer pair is missing or misaligned.
 *
 * Usage:  node scripts/build-course-manifest.mjs   (or: npm run build:course-manifest)
 */
import { parse as parseYaml } from 'yaml';
import { DOMParser } from '@xmldom/xmldom';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const COURSES = join(PUBLIC, 'courses');

const SMALL_WORDS = new Set(['and', 'of', 'the', 'a', 'an', 'in', 'to', 'for']);

/** "01-sound-and-overtones" -> "Sound and Overtones" */
function moduleTitle(dirName) {
  return dirName
    .replace(/^\d+-/, '')
    .split('-')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** "harmony-1" -> "Harmony 1" */
function courseTitle(dirName) {
  return dirName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** "TheCircleOfFifths.mp4" -> "The Circle of Fifths" */
function videoTitle(fileName) {
  return fileName
    .replace(/\.mp4$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .join(' ');
}

/**
 * Read <course>/youtube_uploads.json (if present) into moduleId -> video
 * list, preserving the file's order. Keys look like
 * "elementary-1/01-ear-training-intervals/TheScaleDegrees".
 */
function loadYoutubeVideos(coursePath) {
  const file = join(coursePath, 'youtube_uploads.json');
  if (!existsSync(file)) return new Map();
  const byModule = new Map();
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    for (const [key, video] of Object.entries(data.videos ?? {})) {
      const [, moduleId, scene] = key.split('/');
      if (!moduleId || !scene || !video.youtube_id) continue;
      if (!byModule.has(moduleId)) byModule.set(moduleId, []);
      byModule.get(moduleId).push({
        scene,
        youtubeId: video.youtube_id,
        // "M01 — The major scale: ..." -> "The major scale: ..."
        title: (video.title ?? scene).replace(/^M\d+\s*—\s*/, ''),
      });
    }
  } catch (err) {
    console.warn(`Could not parse ${file}: ${err.message}`);
  }
  return byModule;
}

function dirs(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path).filter(e => statSync(join(path, e)).isDirectory()).sort();
}

/**
 * Count fillable slots: answer chord-events not fully given by the worksheet.
 * Mirrors the slot model in src/utils/musicxml.ts (parseExercise) — keep the
 * two in sync.
 */
function countSlots(worksheetXml, answerXml) {
  const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midiOf = n => {
    const p = n.getElementsByTagName('pitch')[0];
    if (!p) return null;
    const step = p.getElementsByTagName('step')[0]?.textContent ?? 'C';
    const alter = parseInt(p.getElementsByTagName('alter')[0]?.textContent ?? '0', 10) || 0;
    const octave = parseInt(p.getElementsByTagName('octave')[0]?.textContent ?? '4', 10);
    return (octave + 1) * 12 + STEP_PC[step] + alter;
  };
  const events = measure => {
    const evs = [];
    for (const n of Array.from(measure.getElementsByTagName('note'))) {
      if (n.getElementsByTagName('chord').length > 0 && evs.length) evs[evs.length - 1].push(n);
      else evs.push([n]);
    }
    return evs;
  };
  const measures = doc => Array.from(doc.getElementsByTagName('part')[0].getElementsByTagName('measure'));
  const pitchSet = ev => new Set(ev.map(midiOf).filter(m => m !== null));
  const w = new DOMParser().parseFromString(worksheetXml, 'text/xml');
  const a = new DOMParser().parseFromString(answerXml, 'text/xml');
  const wms = measures(w), ams = measures(a);
  if (wms.length !== ams.length) throw new Error(`measure count ${wms.length} != ${ams.length}`);
  let slots = 0;
  for (let i = 0; i < wms.length; i++) {
    const wev = events(wms[i]).map(pitchSet), aev = events(ams[i]).map(pitchSet);
    // Pairwise when shapes match and each worksheet event (rest = empty set)
    // is a subset of its answer counterpart; otherwise the union rule:
    // fillable pitches are those absent from the whole worksheet measure.
    const pairwiseOk = wev.length === aev.length &&
      wev.every((ws, j) => [...ws].every(m => aev[j].has(m)));
    if (pairwiseOk) {
      for (let j = 0; j < wev.length; j++) if (wev[j].size < aev[j].size) slots++;
    } else {
      const union = new Set(wev.flatMap(s => [...s]));
      for (const als of aev) {
        if (als.size > 0 && [...als].some(m => !union.has(m))) slots++;
      }
    }
  }
  return slots;
}

const manifest = { courses: [] };
const report = [];

for (const courseId of dirs(COURSES)) {
  const coursePath = join(COURSES, courseId);
  const course = { id: courseId, title: courseTitle(courseId), path: `courses/${courseId}`, modules: [] };
  const youtubeByModule = loadYoutubeVideos(coursePath);

  for (const moduleId of dirs(coursePath)) {
    const modulePath = join(coursePath, moduleId);
    const mod = {
      id: moduleId,
      number: parseInt(moduleId, 10) || course.modules.length + 1,
      title: moduleTitle(moduleId),
      videos: [],
      exercises: [],
    };

    // YouTube entries first (in upload order) so local mp4s can be deleted;
    // any local video without a YouTube id is kept as a fallback.
    const seenFiles = new Set();
    for (const yt of youtubeByModule.get(moduleId) ?? []) {
      const file = `videos/${yt.scene}.mp4`;
      seenFiles.add(file);
      mod.videos.push({ file, title: yt.title, youtubeId: yt.youtubeId });
    }
    const videosPath = join(modulePath, 'videos');
    if (existsSync(videosPath)) {
      for (const f of readdirSync(videosPath).filter(f => f.toLowerCase().endsWith('.mp4')).sort()) {
        if (!seenFiles.has(`videos/${f}`)) mod.videos.push({ file: `videos/${f}`, title: videoTitle(f) });
      }
    }

    for (const type of dirs(join(modulePath, 'exercises'))) {
      for (const exId of dirs(join(modulePath, 'exercises', type))) {
        const exDir = join(modulePath, 'exercises', type, exId);
        const rel = `exercises/${type}/${exId}`;
        let ok = false, slots = 0, meta = {};
        try {
          meta = parseYaml(readFileSync(join(exDir, 'exercise.yaml'), 'utf8'));
          slots = countSlots(
            readFileSync(join(exDir, 'worksheet.musicxml'), 'utf8'),
            readFileSync(join(exDir, 'answer.musicxml'), 'utf8'),
          );
          ok = true;
          mod.exercises.push({
            id: meta.id ?? exId,
            type: meta.type ?? type,
            title: meta.title ?? exId,
            instructions: meta.instructions ?? '',
            key: meta.key ?? 'C',
            dir: rel,
            slots,
          });
        } catch (err) {
          report.push({ module: moduleId, exercise: exId, error: String(err.message ?? err) });
        }
        void ok;
      }
    }

    course.modules.push(mod);
  }

  manifest.courses.push(course);
}

writeFileSync(join(PUBLIC, 'courses_files.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

for (const course of manifest.courses) {
  const nEx = course.modules.reduce((s, m) => s + m.exercises.length, 0);
  const nVid = course.modules.reduce((s, m) => s + m.videos.length, 0);
  const nYt = course.modules.reduce((s, m) => s + m.videos.filter(v => v.youtubeId).length, 0);
  console.log(`\n${course.title} — ${course.modules.length} modules, ${nVid} videos (${nYt} on YouTube), ${nEx} exercises`);
  for (const m of course.modules) {
    console.log(`  ${m.id}: ${m.videos.length} videos, ${m.exercises.length} exercises` +
      (m.exercises.length ? ` (${m.exercises.reduce((s, e) => s + e.slots, 0)} slots)` : ''));
  }
}
if (report.length) {
  console.log('\nProblems:');
  for (const r of report) console.log(`  ${r.module}/${r.exercise}: ${r.error}`);
} else {
  console.log('\nAll exercises validated.');
}
