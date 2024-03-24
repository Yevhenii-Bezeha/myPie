const express = require("express");
const axios = require("axios");
const moment = require("moment");
const sqlite3 = require("sqlite3").verbose();
const querystring = require("querystring");
require("dotenv").config();
const cron = require("node-cron");

const app = express();
const port = 3000;

// Spotify API credentials
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirect_uri = "http://localhost:3000/callback";

// Create a new database (or open it if it already exists)
const db = new sqlite3.Database("./songs.db", (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log("Connected to the songs database.");
});

// Create the songs table (if it doesn't already exist)
db.run(`CREATE TABLE IF NOT EXISTS songs (
  song_name TEXT,
  played_at TEXT
)`);

let lastFetchTime = Date.now();
console.log(lastFetchTime, "lastFetchTime");
let access_token = null;
let refresh_token = null;

async function getRecent() {
  if (!access_token) {
    console.log("Access token is not available. Please authenticate.");
    return;
  }

  try {
    const response = await axios.get(
      `https://api.spotify.com/v1/me/player/recently-played?limit=50&after=${lastFetchTime}`,
      {
        headers: { Authorization: "Bearer " + access_token },
      }
    );

    const newSongs = response.data.items.map((item) => {
      const played_at = new Date(item.played_at).getTime();
      const song = item.track.name;
      return {
        song_name: song,
        played_at: played_at,
      };
    });

    console.log(`Fetched ${newSongs.length} new songs`);

    if (newSongs.length > 0) {
      // Write the new songs to the database
      const stmt = db.prepare("INSERT INTO songs VALUES (?, ?)");
      for (let song of newSongs) {
        stmt.run(song.song_name, song.played_at);
        console.log(
          `Adding new song: ${song.song_name}, played at: ${new Date(
            song.played_at
          ).toISOString()}`
        );
      }
      stmt.finalize();

      // Update the last fetch time to now
      lastFetchTime = Date.now();
      console.log(lastFetchTime, "lastFetchTime");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Spotify login route
app.get("/login", function (req, res) {
  const state = generateRandomString(16);
  const scope = "user-read-recently-played";

  res.redirect(
    "https://accounts.spotify.com/authorize?" +
      querystring.stringify({
        response_type: "code",
        client_id: client_id,
        scope: scope,
        redirect_uri: redirect_uri,
        state: state,
      })
  );
});

// Spotify callback route
app.get("/callback", async function (req, res) {
  const code = req.query.code || null;

  try {
    const response = await axios({
      method: "post",
      url: "https://accounts.spotify.com/api/token",
      params: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: "authorization_code",
      },
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(client_id + ":" + client_secret).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response.data.access_token) {
      access_token = response.data.access_token;
      refresh_token = response.data.refresh_token; // Store the refresh token
      res.send("Successfully authenticated, you can close this page.");
    } else {
      res.send("Failed to authenticate.");
    }
  } catch (error) {
    console.log(error, "error");
    if (error.response.status === 401) {
      await refreshAccessToken();
      await getRecent();
    } else {
      console.error("Error:", error.message);
    }
  }
});

async function refreshAccessToken() {
  try {
    const response = await axios({
      method: "post",
      url: "https://accounts.spotify.com/api/token",
      params: {
        grant_type: "refresh_token",
        refresh_token: refresh_token,
      },
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(client_id + ":" + client_secret).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response.data.access_token) {
      access_token = response.data.access_token;
      console.log("Access token refreshed successfully");
    } else {
      console.log("Failed to refresh access token");
    }
  } catch (err) {
    console.error("Error refreshing access token", err);
  }
}

function generateRandomString(length) {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});

cron.schedule("*/5 * * * *", getRecent);
