const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const session = require("express-session");
const multer = require("multer");
const methodOverride = require("method-override");

const app = express();
const PORT = 3000;

app.use(methodOverride("_method"));
// Middleware
app.use(bodyParser.json());
app.set("view engine", "ejs");
app.use(expressLayouts);
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Setup express-session
app.use(
    session({
        secret: "secret_key",
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 60000 },
    })
);

// Membuat pool koneksi ke database MySQL
const db = mysql.createPool({
    host: "mysqldb1",
    user: "root",
    password: "123",
    database: "welltix",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// Fungsi helper untuk melakukan query
const query = (sql, values) => {
    return new Promise((resolve, reject) => {
        db.query(sql, values, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
};

// Route untuk halaman Home
app.get("/", async (req, res) => {
    try {
        const sql = "SELECT * FROM event";
        const events = await query(sql);

        // Konversi setiap BLOB ke Base64
        const modifiedEvents = events.map((event) => ({
            ...event,
            poster: event.poster.toString("base64"),
        }));

        res.render("index", {
            title: "Home",
            layout: "layouts/main-layout",
            events: modifiedEvents,
            username: req.session.username || null,
        });
    } catch (err) {
        console.error("Error executing query: " + err.stack);
        res.status(500).send("Error fetching event");
    }
});

app.get("/login", (req, res) => {
    res.render("login", {
        title: "Login",
        layout: "login",
    });
});

// Route untuk login
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const sql = "SELECT * FROM user WHERE username = ? AND password = ?";
        const results = await query(sql, [username, password]);

        if (results.length > 0) {
            req.session.username = username;
            res.redirect("/");
        } else {
            res.status(401).send("Invalid username or password");
        }
    } catch (err) {
        console.error("Error executing query: " + err.stack);
        res.status(500).send("Error during login");
    }
});

// Route untuk logout
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send("Error logging out");
        }
        res.redirect("/login");
    });
});

// Route untuk halaman daftar event
app.get("/events", async (req, res) => {
    if (req.session.username && req.session.username !== "admin") {
        return res.redirect("/");
    }

    try {
        const sql = "SELECT * FROM event";
        const events = await query(sql);

        res.render("events", {
            title: "Daftar Event",
            layout: "layouts/main-layout",
            events: events.map((event) => ({
                ...event,
                poster: event.poster.toString("base64"),
            })),
        });
    } catch (err) {
        console.error("Error executing query: " + err.stack);
        res.status(500).send("Error fetching events");
    }
});

app.get("/events/add", (req, res) => {
    res.render("eventsAdd", {
        title: "Add Event",
        layout: "layouts/main-layout",
    });
});

app.post("/events/add", upload.single("poster"), async (req, res) => {
    const { nama_event, lokasi, harga, tanggal, stok } = req.body;
    const poster = req.file.buffer;

    try {
        const sql =
            "INSERT INTO event (nama_event, poster, lokasi, harga, tgl, stok) VALUES (?, ?, ?, ?, ?, ?)";
        await query(sql, [nama_event, poster, lokasi, harga, tanggal, stok]);
        res.redirect("/events");
    } catch (err) {
        console.error("Error executing query: " + err.stack);
        res.status(500).send("Error adding event");
    }
});

app.get("/events/edit/:id", async (req, res) => {
    const eventId = req.params.id;

    try {
        const sql = "SELECT * FROM event WHERE id = ?";
        const results = await query(sql, [eventId]);

        if (results.length === 0) {
            return res.status(404).send("Event not found");
        }

        const event = results[0];

        res.render("eventsEdit", {
            title: "Edit Event",
            layout: "layouts/main-layout",
            event: {
                ...event,
                poster: event.poster.toString("base64"),
            },
        });
    } catch (err) {
        console.error("Error executing query: " + err.stack);
        res.status(500).send("Error fetching event");
    }
});

app.post("/events/update/:id", upload.single("poster"), async (req, res) => {
    const { nama_event, tanggal, harga, stok, lokasi } = req.body;
    const eventId = req.params.id;

    try {
        let sql, values;

        if (req.file) {
            const poster = req.file.buffer;
            sql =
                "UPDATE event SET nama_event = ?, lokasi = ?, harga = ?, tgl = ?, stok = ?, poster = ? WHERE id = ?";
            values = [nama_event, lokasi, harga, tanggal, stok, poster, eventId];
        } else {
            sql =
                "UPDATE event SET nama_event = ?, lokasi = ?, harga = ?, tgl = ?, stok = ? WHERE id = ?";
            values = [nama_event, lokasi, harga, tanggal, stok, eventId];
        }

        await query(sql, values);
        res.redirect("/events");
    } catch (err) {
        console.error("Error executing query: " + err.stack);
        res.status(500).send("Error updating event");
    }
});

app.delete("/events", async (req, res) => {
    const eventId = req.body.id;

    try {
        const sql = "DELETE FROM event WHERE id = ?";
        const result = await query(sql, [eventId]);

        if (result.affectedRows === 0) {
            return res.status(404).send("Event not found");
        }

        res.redirect("/events");
    } catch (err) {
        console.error("Error executing query: " + err.stack);
        res.status(500).send("Error deleting event");
    }
});

// Route untuk menampilkan semua transaksi (hanya untuk admin)
app.get("/transaksiAll", async (req, res) => {
    if (req.session.username && req.session.username !== "admin") {
        return res.redirect("/");
    }

    try {
        const sql = "SELECT * FROM transaksi";
        const transaksis = await query(sql);

        const transaksiWithPosters = await Promise.all(
            transaksis.map(async (transaksi) => {
                const sqlPoster = "SELECT poster FROM event WHERE id = ?";
                const [event] = await query(sqlPoster, [transaksi.id_event]);

                return {
                    ...transaksi,
                    poster: event ? event.poster.toString("base64") : null,
                };
            })
        );

        res.render("transaksiAll", {
            title: "Transaksi",
            layout: "layouts/main-layout",
            transaksis: transaksiWithPosters,
        });
    } catch (err) {
        console.error("Error fetching transactions: " + err.stack);
        res.status(500).send("Error fetching transaksi");
    }
});

// Route untuk mengupdate status transaksi
app.put("/transaksiAll", async (req, res) => {
    const id_transaksi = req.body.id;

    try {
        const sql = "UPDATE transaksi SET status = ? WHERE id = ?";
        const result = await query(sql, ["lunas", id_transaksi]);

        if (result.affectedRows === 0) {
            return res.status(404).send("Transaksi not found");
        }

        res.redirect("/transaksiAll");
    } catch (err) {
        console.error("Error updating transaksi: " + err.stack);
        res.status(500).send("Error updating data");
    }
});

// Route untuk menampilkan riwayat transaksi user
app.get("/history", async (req, res) => {
    const username = req.session.username;

    try {
        const sql = `
            SELECT transaksi.*, event.poster 
            FROM transaksi 
            INNER JOIN event ON transaksi.id_event = event.id 
            WHERE transaksi.id_user = (SELECT id FROM user WHERE username = ?)
        `;
        const histories = await query(sql, [username]);

        const historiesWithPoster = histories.map((history) => ({
            ...history,
            poster: history.poster ? history.poster.toString("base64") : null,
        }));

        res.render("history", {
            title: "History",
            layout: "layouts/main-layout",
            histories: historiesWithPoster,
        });
    } catch (err) {
        console.error("Error fetching history: " + err.stack);
        res.status(500).send("Error fetching data");
    }
});

// Route untuk menampilkan halaman order
app.get("/order/:id", async (req, res) => {
    const userName = req.session.username;
    const idEvent = req.params.id;

    if (isNaN(idEvent)) {
        return res.status(400).send("ID event tidak valid.");
    }

    try {
        const sql = "SELECT * FROM event WHERE id = ?";
        const [event] = await query(sql, [idEvent]);

        // Cek jika event ditemukan
        if (!event) {
            return res.status(404).send("Event tidak ditemukan.");
        }

        const modifiedEvent = {
            ...event,
            poster: event.poster.toString("base64"),
        };

        const sqlId = "SELECT id FROM user WHERE username = ?";
        const [user] = await query(sqlId, [userName]);

        res.render("order", {
            title: "Order",
            layout: "layouts/main-layout",
            event: modifiedEvent,
            user: user,
        });
    } catch (err) {
        console.error("Error fetching order: " + err.stack);
        res.status(500).send("Terjadi kesalahan saat mengambil data.");
    }
});

// Route untuk membuat transaksi baru
app.post("/transaksi", async (req, res) => {
    const { id_user, id_event, harga, jumlah, total, pembayaran } = req.body;

    try {
        const sql = `
            INSERT INTO transaksi (id_user, id_event, harga, jumlah, total, pembayaran, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await query(sql, [id_user, id_event, harga, jumlah, total, pembayaran, "pending"]);
        res.redirect("/history");
    } catch (err) {
        console.error("Error creating transaction: " + err.stack);
        res.status(500).send("Error creating transaksi");
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
