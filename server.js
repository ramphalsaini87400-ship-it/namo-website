const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

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

app.get("/api/movies", (req, res) => {
    res.json(getMovies());
});

app.get("/api/movies/:id", (req, res) => {
    const movies = getMovies();

    const movie = movies.find(
        m => m.id === req.params.id
    );

    if (!movie) {
        return res.status(404).json({
            error: "Movie not found"
        });
    }

    res.json(movie);
});

// =============================
// LIKE / DISLIKE API
// =============================

app.post("/api/movies/:id/like", (req, res) => {
    const movies = getMovies();

    const index = movies.findIndex(
        m => m.id === req.params.id
    );

    if (index === -1) {
        return res.status(404).json({
            error: "Movie not found"
        });
    }

    movies[index].likes =
        Number(movies[index].likes) || 0;

    movies[index].likes++;

    saveMovies(movies);

    res.json({
        likes: movies[index].likes
    });
});


app.post("/api/movies/:id/dislike", (req, res) => {
    const movies = getMovies();

    const index = movies.findIndex(
        m => m.id === req.params.id
    );

    if (index === -1) {
        return res.status(404).json({
            error: "Movie not found"
        });
    }

    movies[index].dislikes =
        Number(movies[index].dislikes) || 0;

    movies[index].dislikes++;

    saveMovies(movies);

    res.json({
        dislikes: movies[index].dislikes
    });
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

app.post(
    "/api/movies",
    requireAdmin,
    upload.fields([
        {
            name: "poster",
            maxCount: 1
        },
        {
            name: "video",
            maxCount: 1
        }
    ]),
    (req, res) => {

        try {
            const movies = getMovies();

            const poster =
                req.files?.poster?.[0];

            const video =
                req.files?.video?.[0];

            if (!poster || !video) {
                return res.status(400).json({
                    error: "Poster and video required"
                });
            }

            const movie = {
                id:
                    Date.now().toString() +
                    "-" +
                    Math.random()
                        .toString(36)
                        .substring(2, 8),

                title: req.body.title || "Untitled",

                category:
                    req.body.category || "Movie",

                year:
                    req.body.year || "",

                description:
                    req.body.description || "",

                posterUrl:
                    "/uploads/posters/" +
                    poster.filename,

                videoUrl:
                    "/uploads/videos/" +
                    video.filename,

                createdAt:
                    new Date().toISOString()
            };

            movies.unshift(movie);

            saveMovies(movies);

            res.json({
                success: true,
                movie: movie
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error: "Upload failed"
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
    (req, res) => {

        const movies = getMovies();

        const index = movies.findIndex(
            m => m.id === req.params.id
        );

        if (index === -1) {
            return res.status(404).json({
                error: "Movie not found"
            });
        }

        const allowedFields = [
            "title",
            "category",
            "year",
            "description"
        ];

        for (const field of allowedFields) {
            if (
                typeof req.body[field] ===
                "string"
            ) {
                movies[index][field] =
                    req.body[field];
            }
        }

        saveMovies(movies);

        res.json({
            success: true,
            movie: movies[index]
        });
    }
);


// =============================
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
    (req, res) => {

        const movies = getMovies();

        const index = movies.findIndex(
            m => m.id === req.params.id
        );

        if (index === -1) {
            return res.status(404).json({
                error: "Movie not found"
            });
        }

        const movie = movies[index];

        movies.splice(index, 1);

        saveMovies(movies);

        deleteStoredFile(
            movie.posterUrl,
            postersDir
        );

        deleteStoredFile(
            movie.videoUrl,
            videosDir
        );

        res.json({
            success: true,
            message: "Movie deleted"
        });
    }
);


// =============================
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

app.listen(PORT, () => {
    console.log(
        `NAMO server running at http://localhost:${PORT}`
    );
});
