
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseBuffer } from 'music-metadata';
import yaml from 'js-yaml';

const MUSIC_DATA_PATH = path.resolve('src/data/music.json');
const CONFIG_PATH = path.resolve('ryuchan.config.yaml');
const CONCURRENCY = 8;
const RETRIES = 3;
const SAVE_INTERVAL = 20; // incremental save every N resolved

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPlaylistSongs(playlistId, trans) {
  const apiUrl = `https://163.hyc.moe?server=netease&type=playlist&id=${playlistId}`;
  console.log(`  🎵 Fetching playlist ${playlistId}...`);
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error(`Meting API failed: ${res.statusText}`);
    const data = await res.json();
    return data.map(item => {
      let songUrl = item.url?.replace(/http:\/\//g, 'https://');
      let lrcUrl = item.lrc?.replace(/http:\/\//g, 'https://');
      if (songUrl) songUrl += `&br=320`;
      if (trans && lrcUrl) lrcUrl += `&trans=true`;
      return {
        title: item.name,
        artist: item.artist || item.artist_name || 'Unknown',
        cover: item.pic?.replace(/http:\/\//g, 'https://'),
        url: songUrl,
        lrc: lrcUrl,
        duration: ""
      };
    });
  } catch (e) {
    console.error(`  ❌ Failed to fetch playlist ${playlistId}:`, e.message);
    return [];
  }
}

/**
 * Fetch duration for a single song with retries.
 * 1) Try Netease song detail API (fast, no bandwidth) for hyc.moe URLs.
 * 2) Fall back to buffer-parsing the actual audio stream.
 * Returns true on success, false after all retries exhausted.
 */
async function fetchDurationForSong(item) {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      // --- Path A: Netease API (hyc.moe URLs only) ---
      if (item.url && item.url.includes('163.hyc.moe')) {
        try {
          const parsedUrl = new URL(item.url);
          const id = parsedUrl.searchParams.get('id');
          if (id) {
            const res = await fetch(`https://music.163.com/api/song/detail/?id=${id}&ids=[${id}]`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.songs?.[0]?.duration) {
                item.duration = formatDuration(data.songs[0].duration / 1000);
                return true;
              }
            }
          }
        } catch (e) {
          // Netease API failed → fall through to buffer method below
        }
      }

      // --- Path B: buffer parsing ---
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(item.url, {
        headers: { 'Range': 'bytes=0-500000' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok || response.status === 206) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 1024) continue; // too small, retry
        const metadata = await parseBuffer(buffer, {
          mimeType: response.headers.get('content-type') || undefined
        });
        if (metadata?.format?.duration) {
          item.duration = formatDuration(metadata.format.duration);
          return true;
        }
      }
    } catch (e) {
      // retry on error (network timeout, etc.)
    }

    // backoff before retry
    if (attempt < RETRIES - 1) {
      await sleep(1000 * Math.pow(2, attempt)); // 1s, 2s, 4s
    }
  }

  return false;
}

async function fetchMusicDuration() {
  try {
    let config = {};
    try {
      const configStr = await fs.readFile(CONFIG_PATH, 'utf-8');
      config = yaml.load(configStr) || {};
    } catch (e) {
      console.log('Could not load config, using defaults');
    }

    const trans = config?.site?.meting?.trans !== false;
    const playlists = config?.music?.playlists || [];

    if (playlists.length === 0) {
      const singleId = config?.site?.meting?.id || '8900628861';
      playlists.push({ id: singleId, name: '默认歌单', server: 'netease' });
    }

    console.log(`🎵 Fetching ${playlists.length} playlist(s)...`);

    // Compute fingerprint of playlist config to detect changes
    const fingerprint = crypto
      .createHash('md5')
      .update(JSON.stringify(playlists))
      .digest('hex');

    // Load existing data for duration caching
    let existingData = { songs: [], playlistCounts: {}, playlistSongs: {} };
    const urlToDuration = new Map();
    try {
      const raw = await fs.readFile(MUSIC_DATA_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        existingData = { songs: parsed, playlistCounts: {}, playlistSongs: {} };
      } else {
        existingData = parsed;
      }
      existingData.songs.forEach(s => {
        if (s.url && s.duration) urlToDuration.set(s.url, s.duration);
      });
      // Skip entirely if playlist config hasn't changed
      if (existingData._fingerprint === fingerprint) {
        console.log('✅ Playlist unchanged, all durations already cached. Skipping fetch.');
        return;
      }
    } catch (e) { /* no existing data */ }

    // Fetch all playlists
    const playlistCounts = {};
    const playlistSongs = {};
    const allSongs = [];
    const seenUrls = new Set();
    const urlToSong = new Map();

    for (const pl of playlists) {
      let songs;
      if (pl.type === 'custom') {
        // 处理自定义歌单 - 从 music.json 的 playlistSongs 中读取
        try {
          songs = existingData.playlistSongs?.[pl.id] || [];
          console.log(`  ✅ ${pl.name || pl.id} (自定义): ${songs.length} 首`);
        } catch (e) {
          console.error(`  ❌ 读取自定义歌单 ${pl.name || pl.id} 失败:`, e.message);
          songs = [];
        }
      } else {
        // 处理普通 ID 歌单
        songs = await fetchPlaylistSongs(pl.id, trans);
        console.log(`  ✅ ${pl.name || pl.id}: ${songs.length} 首`);
      }

      playlistCounts[pl.id] = songs.length;
      playlistSongs[pl.id] = [];

      for (const song of songs) {
        if (!seenUrls.has(song.url)) {
          seenUrls.add(song.url);
          if (urlToDuration.has(song.url)) {
            song.duration = urlToDuration.get(song.url);
          }
          allSongs.push(song);
          urlToSong.set(song.url, song);
          playlistSongs[pl.id].push(song);
        } else {
          playlistSongs[pl.id].push(urlToSong.get(song.url));
        }
      }
    }

    console.log(`📊 Total unique songs: ${allSongs.length}`);

    // Collect songs that need duration fetching
    const pending = allSongs.filter(s => s.url && !s.duration);
    const alreadyCached = allSongs.length - pending.length;

    console.log(`📊 Cached durations: ${alreadyCached}`);
    console.log(`📊 Need durations: ${pending.length}`);

    if (pending.length === 0) {
      console.log('✅ All durations already cached.');
      return;
    }

    // --- Concurrent duration fetching ---
    console.log(`🎵 Fetching ${pending.length} durations (${CONCURRENCY} concurrent, ${RETRIES} retries)...`);

    let index = 0;
    let success = 0;
    let failed = 0;
    let lastSave = 0;

    const output = { songs: allSongs, playlistCounts, playlistSongs, _fingerprint: fingerprint };

    async function worker(workerId) {
      while (true) {
        const i = index;
        index++;
        if (i >= pending.length) break;

        const item = pending[i];
        const ok = await fetchDurationForSong(item);

        if (ok) {
          success++;
          const label = item.duration ? ` -> ${item.duration}` : ` -> ok`;
          console.log(`  [${workerId}]${label} (${success + failed}/${pending.length}) ${item.title}`);
        } else {
          failed++;
          console.warn(`  [${workerId}] -> FAILED (${success + failed}/${pending.length}) ${item.title}`);
        }

        // Incremental save
        if (success - lastSave >= SAVE_INTERVAL) {
          lastSave = success;
          try {
            await fs.writeFile(MUSIC_DATA_PATH, JSON.stringify(output, null, 4), 'utf-8');
            console.log(`  💾 Saved (${success} resolved so far)`);
          } catch (e) {
            console.error('  ⚠️  Save failed:', e.message);
          }
        }
      }
    }

    const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
    await Promise.all(workers);

    // Final save
    await fs.writeFile(MUSIC_DATA_PATH, JSON.stringify(output, null, 4), 'utf-8');

    console.log(`\n✅ Done. Resolved: ${success}, Failed: ${failed}, Total: ${allSongs.length}`);
    if (failed > 0) {
      console.log(`⚠️  ${failed} songs could not get durations. Re-run to retry.`);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

fetchMusicDuration();
