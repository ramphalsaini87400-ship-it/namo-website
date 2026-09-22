const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const {
    initDatabase,
    getMoviesFromDatabase,
    saveMovieToDatabase,
    deleteMovieFromDatabase,
    migrateMoviesOnce
} = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD = process.env.NAMO_ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
    console.error("NAMO_ADMIN_PASSWORD set nahi hai.");
    console.error("Pehle run karo:");
    console.error("export NAMO_ADMIN_PASSWORD='your-password'");
    process.exit(1);
}

const uploadsDir = path.join(__dirname, "uploads");
const postersDir = path.join(uploadsDir, "posters");
const videosDir = path.join(uploadsDir, "videos");
const moviesFile = path.join(__dirname, "movies.json");

fs.mkdirSync(postersDir, { recursive: true });
fs.mkdirSync(videosDir, { recursive: true });

if (!fs.existsSync(moviesFile)) {
    fs.writeFileSync(moviesFile, "[]");
}

app.use(express.json());
app.use(express.static(__dirname));
app.use("/uploads", express.static(uploadsDir));

function getMovies() {
    try {
        return JSON.parse(fs.readFileSync(moviesFile, "utf8"));
    } catch {
        return [];
    }
}

function saveMovies(movies) {
    fs.writeFileSync(
        moviesFile,
        JSON.stringify(movies, null, 2)
    );
}

function requireAdmin(req, res, next) {
    const password = req.get("x-admin-password");

    if (!password || password !== ADMIN_PASSWORD) {
        return res.status(401).json({
            error: "Wrong admin password"
        });
    }

    next();
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === "poster") {
            cb(null, postersDir);
        } else if (file.fieldname === "video") {
            cb(null, videosDir);
        } else {
            cb(new Error("Invalid field"));
        }
    },

    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);

        const name =
            Date.now() +
            "-" +
            Math.random()
                .toString(36)
                .substring(2, 10) +
            ext;

        cb(null, name);
    }
});

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 2 * 1024 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {
        if (file.fieldname === "poster") {
            if (file.mimetype.startsWith("image/")) {
                cb(null, true);
            } else {
                cb(new Error("Poster must be an image"));
            }
        }

        else if (file.fieldname === "video") {
            const allowed = [
                "video/mp4",
                "video/webm",
                "video/ogg"
            ];

            if (allowed.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error("Only MP4, WebM and OGG videos allowed"));
            }
        }

        else {
            cb(new Error("Invalid file"));
        }
    }
});


// =============================
// PUBLIC API
// =============================

app.get("/api/movies", async (req, res) => {
    try {
        const movies = await getMoviesFromDatabase();

        res.json(movies);
    } catch (error) {
        console.error("Get movies error:", error);

        res.status(500).json({
            error: "Movies load failed"
        });
    }
});

app.get("/api/movies/:id", async (req, res) => {
    try {
        const movies = await getMoviesFromDatabase();

        const movie = movies.find(
            m => m.id === req.params.id
        );

        if (!movie) {
            return res.status(404).json({
                error: "Movie not found"
            });
        }

        res.json(movie);
    } catch (error) {
        console.error("Get movie error:", error);

        res.status(500).json({
            error: "Movie load failed"
        });
    }
});

// =============================
// LIKE / DISLIKE API
// =============================

app.post("/api/movies/:id/like", async (req, res) => {
    try {
        const movies = await getMoviesFromDatabase();
        const movie = movies.find(m => m.id === req.params.id);

        if (!movie) {
            return res.status(404).json({
                error: "Movie not found"
            });
        }

        movie.likes = (Number(movie.likes) || 0) + 1;

        await saveMovieToDatabase(movie);

        res.json({
            likes: movie.likes
        });
    } catch (error) {
        console.error("Like error:", error);

        res.status(500).json({
            error: "Like failed"
        });
    }
});


app.post("/api/movies/:id/dislike", async (req, res) => {
    try {
        const movies = await getMoviesFromDatabase();
        const movie = movies.find(m => m.id === req.params.id);

        if (!movie) {
            return res.status(404).json({
                error: "Movie not found"
            });
        }

        movie.dislikes = (Number(movie.dislikes) || 0) + 1;

        await saveMovieToDatabase(movie);

        res.json({
            dislikes: movie.dislikes
        });
    } catch (error) {
        console.error("Dislike error:", error);

        res.status(500).json({
            error: "Dislike failed"
        });
    }
});


// =============================
// ADMIN LOGIN CHECK
// =============================

app.get("/api/admin/check", requireAdmin, (req, res) => {
    res.json({
        success: true
    });
});


// =============================
// ADD MOVIE
// =============================

// =============================
// ADD MOVIE
// =============================

app.post(
    "/api/movies",
    requireAdmin,
    upload.single("poster"),
    async (req, res) => {

        try {


            const poster = req.file;

            if (!poster) {
                return res.status(400).json({
                    error: "Poster required"
                });
            }

            const download1080 =
                (req.body.download1080 || "").trim();

            const download720 =
                (req.body.download720 || "").trim();

            const download480 =
                (req.body.download480 || "").trim();


            function validUrl(value) {

                if (!value) return true;

                try {

                    const parsed =
                        new URL(value);

                    return (
                        parsed.protocol === "http:" ||
                        parsed.protocol === "https:"
                    );

                } catch {

                    return false;
                }
            }


            if (!validUrl(download1080) ||
                !validUrl(download720) ||
                !validUrl(download480)) {

                return res.status(400).json({
                    error: "Invalid download URL"
                });
            }


            if (
                !download1080 &&
                !download720 &&
                !download480
            ) {

                return res.status(400).json({
                    error: "At least one download link required"
                });
            }


            const movie = {

                id:
                    Date.now().toString() +
                    "-" +
                    Math.random()
                        .toString(36)
                        .substring(2, 8),

                title:
                    req.body.title ||
                    "Untitled",

                category:
                    req.body.category ||
                    "Movie",

                year:
                    req.body.year ||
                    "",

                description:
                    req.body.description ||
                    "",

                posterUrl:
                    "/uploads/posters/" +
                    poster.filename,

                download1080:
                    download1080,

                download720:
                    download720,

                download480:
                    download480,

                likes: 0,

                dislikes: 0,

                createdAt:
                    new Date().toISOString()
            };


            await saveMovieToDatabase(movie);



            res.json({
                success: true,
                movie: movie
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                error: "Movie publish failed"
            });
        }
    }
);

// =============================
// EDIT MOVIE
// =============================

app.patch(
    "/api/movies/:id",
    requireAdmin,
    async (req, res) => {
        try {
            const movies = await getMoviesFromDatabase();

            const index = movies.findIndex(
                m => m.id === req.params.id
            );

            if (index === -1) {
                return res.status(404).json({
                    error: "Movie not found"
                });
            }

            const movie = movies[index];

            const downloadFields = [
                "download1080",
                "download720",
                "download480"
            ];

            for (const field of downloadFields) {
                if (typeof req.body[field] === "string") {
                    const value = req.body[field].trim();

                    if (value) {
                        try {
                            const parsed = new URL(value);

                            if (
                                parsed.protocol !== "http:" &&
                                parsed.protocol !== "https:"
                            ) {
                                return res.status(400).json({
                                    error: "Invalid download URL"
                                });
                            }
                        } catch {
                            return res.status(400).json({
                                error: "Invalid download URL"
                            });
                        }
                    }

                    movie[field] = value;
                }
            }

            for (const field of [
                "title",
                "category",
                "year",
                "description"
            ]) {
                if (typeof req.body[field] === "string") {
                    movie[field] = req.body[field];
                }
            }

            await saveMovieToDatabase(movie);

            res.json({
                success: true,
                movie: movie
            });
        } catch (error) {
            console.error("Update movie error:", error);

            res.status(500).json({
                error: "Movie update failed"
            });
        }
    }
);

// DELETE MOVIE
// =============================

function deleteStoredFile(fileUrl, folder) {

    if (!fileUrl) return;

    const filename =
        path.basename(fileUrl);

    if (!filename) return;

    const filePath =
        path.join(folder, filename);

    if (
        path.dirname(filePath) === folder &&
        fs.existsSync(filePath)
    ) {
        fs.unlinkSync(filePath);
    }
}

app.delete(
    "/api/movies/:id",
    requireAdmin,
    async (req, res) => {
        try {
            const movies = await getMoviesFromDatabase();

            const movie = movies.find(
                m => m.id === req.params.id
            );

            if (!movie) {
                return res.status(404).json({
                    error: "Movie not found"
                });
            }

            await deleteMovieFromDatabase(req.params.id);

            deleteStoredFile(
                movie.posterUrl,
                postersDir
            );

            res.json({
                success: true,
                message: "Movie deleted"
            });
        } catch (error) {
            console.error("Delete movie error:", error);

            res.status(500).json({
                error: "Movie delete failed"
            });
        }
    }
);

// ERROR HANDLER
// =============================

app.use((err, req, res, next) => {

    console.error(err);

    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            error: err.message
        });
    }

    res.status(400).json({
        error: err.message ||
            "Something went wrong"
    });
});


// =============================
// START SERVER
// =============================

async function startServer() {
    try {
        await initDatabase();
        await migrateMoviesOnce();

        app.listen(PORT, () => {
            console.log(
                `NAMO server running at http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error("Database startup failed:", error);
        process.exit(1);
    }
}

startServer();
