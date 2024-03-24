const express = require("express");
const axios = require("axios");
const moment = require("moment");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config();
const cron = require("node-cron");

const app = express();
const port = 3000;

// Create a new database (or open it if it already exists)
let db = new sqlite3.Database(
  "./songs.db",
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error(err.message);
    }
    console.log("Connected to the songs database.");
  }
);

// Create the songs table (if it doesn't already exist)
db.run(`CREATE TABLE IF NOT EXISTS songs (
  song_name TEXT,
  played_at TEXT UNIQUE
)`);

async function getRecent() {
  try {
    const params = { limit: 49 };
    const token = process.env.BEARER_TOKEN;
    console.log("Successfully fetched token:", token);

    const response = await axios.get(
      "https://api.spotify.com/v1/me/player/recently-played",
      {
        headers: { Authorization: "Bearer " + token },
      }
    );

    const newSongs = response.data.items.map((item) => {
      const played_at = moment(item.played_at).format(
        "MMMM Do YYYY, h:mm:ss a"
      );
      const song = item.track.name;
      return {
        song_name: song,
        played_at: played_at,
      };
    });

    console.log(`Fetched ${newSongs.length} new songs`);

    if (newSongs.length > 0) {
      // Write the new songs to the database
      const stmt = db.prepare("INSERT OR IGNORE INTO songs VALUES (?, ?)");
      for (let song of newSongs) {
        stmt.run(song.song_name, song.played_at);
      }
      stmt.finalize();
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

cron.schedule("*/1 * * * *", getRecent);

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
