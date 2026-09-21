const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const moviesFile = path.join(__dirname, "movies.json");

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS namo_movies (
            id TEXT PRIMARY KEY,
            movie JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS namo_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);
}

async function getMoviesFromDatabase() {
    const result = await pool.query(`
        SELECT movie
        FROM namo_movies
        ORDER BY created_at DESC
    `);

    return result.rows.map(row => row.movie);
}

async function saveMovieToDatabase(movie) {
    await pool.query(
        `
        INSERT INTO namo_movies
            (id, movie, created_at)
        VALUES
            ($1, $2::jsonb, $3)
        ON CONFLICT (id)
        DO UPDATE SET
            movie = EXCLUDED.movie,
            created_at = EXCLUDED.created_at
        `,
        [
            movie.id,
            JSON.stringify(movie),
            movie.createdAt || new Date().toISOString()
        ]
    );
}

async function deleteMovieFromDatabase(id) {
    await pool.query(
        `DELETE FROM namo_movies WHERE id = $1`,
        [id]
    );
}

async function migrateMoviesOnce() {
    const setting = await pool.query(
        `SELECT value FROM namo_settings WHERE key = 'movies_migrated'`
    );

    if (setting.rows.length > 0) {
        return;
    }

    let movies = [];

    try {
        movies = JSON.parse(
            fs.readFileSync(moviesFile, "utf8")
        );
    } catch {
        movies = [];
    }

    for (const movie of movies) {
        await saveMovieToDatabase(movie);
    }

    await pool.query(
        `
        INSERT INTO namo_settings (key, value)
        VALUES ('movies_migrated', 'true')
        ON CONFLICT (key)
        DO UPDATE SET value = 'true'
        `
    );

    console.log(
        `Movies migration complete: ${movies.length} movie(s)`
    );
}

async function closeDatabase() {
    await pool.end();
}

module.exports = {
    pool,
    initDatabase,
    getMoviesFromDatabase,
    saveMovieToDatabase,
    deleteMovieFromDatabase,
    migrateMoviesOnce,
    closeDatabase
};
