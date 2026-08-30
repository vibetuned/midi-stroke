// Throwaway hardware probe.
//   cargo run --example lumi_probe                      # list ports
//   cargo run --example lumi_probe <port> key <pc> [dev-hex]   # sysex set-root-key
//   cargo run --example lumi_probe <port> blink <note> [secs]  # note-on/off loop
fn checksum(cmd: &[u8]) -> u8 {
    let mut c = cmd.len() as u32;
    for &b in cmd { c = (c * 3 + b as u32) & 0xff; }
    (c & 0x7f) as u8
}

fn main() {
    let out = midir::MidiOutput::new("lumi-probe").unwrap();
    let ports = out.ports();
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        for (i, p) in ports.iter().enumerate() {
            println!("[{}] {}", i, out.port_name(p).unwrap_or_default());
        }
        return;
    }
    let idx: usize = args[1].parse().unwrap();
    let name = out.port_name(&ports[idx]).unwrap_or_default();
    let mut conn = out.connect(&ports[idx], "lumi-probe").unwrap();

    match args[2].as_str() {
        "key" => {
            let pc: u8 = args[3].parse().unwrap();
            let dev: u8 = args.get(4).map(|s| u8::from_str_radix(s, 16).unwrap()).unwrap_or(0x00);
            let cmd = [0x10u8, 0x30, 0x03 | ((pc & 3) << 5), pc >> 2, 0, 0, 0, 0];
            let mut frame = vec![0xf0, 0x00, 0x21, 0x10, 0x77, dev];
            frame.extend_from_slice(&cmd);
            frame.push(checksum(&cmd));
            frame.push(0xf7);
            conn.send(&frame).unwrap();
            println!("sysex set-key pc={pc} dev={dev:02X} -> {name}");
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
        "blink" => {
            let note: u8 = args[3].parse().unwrap();
            let secs: u64 = args.get(4).map(|s| s.parse().unwrap()).unwrap_or(20);
            println!("blinking note {note} on {name} for {secs}s — watch the key / cycle modes");
            for _ in 0..secs {
                conn.send(&[0x90, note, 100]).unwrap();
                std::thread::sleep(std::time::Duration::from_millis(500));
                conn.send(&[0x80, note, 0]).unwrap();
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        }
        "vels" => {
            let note: u8 = args[3].parse().unwrap();
            for vel in [127u8, 90, 60, 30, 10, 3] {
                println!("velocity {vel}");
                conn.send(&[0x90, note, vel]).unwrap();
                std::thread::sleep(std::time::Duration::from_millis(1500));
                conn.send(&[0x80, note, 0]).unwrap();
                std::thread::sleep(std::time::Duration::from_millis(400));
            }
        }
        "scale" => {
            // major=02 00, minor=22 00, harmonic minor=42 00, chromatic=42 04
            let b3 = u8::from_str_radix(&args[3], 16).unwrap();
            let b4 = u8::from_str_radix(&args[4], 16).unwrap();
            let cmd = [0x10u8, 0x60, b3, b4, 0, 0, 0, 0];
            let mut frame = vec![0xf0, 0x00, 0x21, 0x10, 0x77, 0x00];
            frame.extend_from_slice(&cmd);
            frame.push(checksum(&cmd));
            frame.push(0xf7);
            conn.send(&frame).unwrap();
            println!("sysex set-scale {b3:02X} {b4:02X} -> {name}");
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
        "bright" => {
            // value 0-100 (%): byte3 = 0x04 | ((v & 3) << 5), byte4 = v >> 2
            let v: u8 = args[3].parse().unwrap();
            let cmd = [0x10u8, 0x40, 0x04 | ((v & 3) << 5), v >> 2, 0, 0, 0, 0];
            let mut frame = vec![0xf0, 0x00, 0x21, 0x10, 0x77, 0x00];
            frame.extend_from_slice(&cmd);
            frame.push(checksum(&cmd));
            frame.push(0xf7);
            conn.send(&frame).unwrap();
            println!("sysex brightness {v}% -> {name}");
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
        other => println!("unknown mode {other}"),
    }
}
