import { createApp } from './app.ts';
import { openDb, ScoreStore } from './db.ts';

const port = Number(process.env.PORT ?? 3001);

const db = openDb();
const app = createApp(new ScoreStore(db));

app.listen(port, () => {
    console.log(`MEI score server listening on http://localhost:${port}`);
});
