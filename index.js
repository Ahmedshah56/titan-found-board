// ========================================================
// 1. FORCE PUBLIC DNS RESOLUTION (Bypasses local ISP blocks)
// ========================================================
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();

const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');

const app = express();
const PORT = process.env.PORT || 3000;

// Cloudinary is optional. If CLOUDINARY_URL isn't set, uploads fall back to
// local disk storage in /public/uploads so the app still works out of the box.
const cloudinaryEnabled = !!process.env.CLOUDINARY_URL;
let cloudinary = null;
if (cloudinaryEnabled) {
    cloudinary = require('cloudinary').v2;
}

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
try {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) {
    // Read-only filesystem (e.g. Vercel) — fine as long as CLOUDINARY_URL is set.
}

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB safety cap
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed.'));
    }
});

// ========================================================
// 2. MIDDLEWARE CONFIGURATION
// ========================================================
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '7d',
    etag: true
}));

// Vercel (and most serverless/proxy hosts) sits in front of the app —
// this tells express-session to trust the proxy's HTTPS so secure cookies work.
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET || 'titan_secure_board_secret_key_991',
    resave: false,
    saveUninitialized: false,
    // Sessions are stored in MongoDB instead of the default in-memory store.
    // On a serverless host like Vercel, each request can be handled by a
    // different function instance — an in-memory store would mean users get
    // logged out at random. This keeps login state consistent everywhere,
    // including on a single traditional server.
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60 // 1 day, matches the cookie below
    }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production'
    }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ========================================================
// 3. DATABASE CONNECTION
// ========================================================
const dbOptions = {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 60000,
    connectTimeoutMS: 60000,
    socketTimeoutMS: 60000,
};

mongoose.connect(process.env.MONGO_URI, dbOptions)
    .then(() => console.log('Database connected.'))
    .catch((err) => console.error('Database connection error:', err));

// ========================================================
// 4. MODELS
// ========================================================
const User = require('./models/user');
const Item = require('./models/item');

const CATEGORIES = ['electronics', 'documents', 'keys', 'bags', 'accessories', 'clothing', 'books', 'other'];
const LOCATIONS = ['Central Library', 'Engineering Block', 'Admin Block', 'Main Parking Arena', 'Cafeteria', 'Sports Complex', 'Hostel Block', 'Auditorium'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ========================================================
// 5. AUTH HELPERS
// ========================================================
const requireAuth = (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login');
    next();
};

const requireAuthApi = (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ success: false, error: 'You must be logged in.' });
    next();
};

const currentUser = (req) => ({
    name: req.session.userName || 'Student',
    email: req.session.userEmail || ''
});

// Uploads either to Cloudinary (if configured) or local disk, and returns a public URL.
// Local disk storage only works on a traditional always-on server — serverless
// hosts like Vercel have a read-only filesystem at request time, so Cloudinary
// is required there.
const isServerless = !!process.env.VERCEL;
async function storeImage(file) {
    if (!file) return null;
    if (cloudinaryEnabled) {
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: 'found_board_assets' },
                (error, result) => (result ? resolve(result) : reject(error))
            );
            stream.end(file.buffer);
        });
        return result.secure_url;
    }
    if (isServerless) {
        throw new Error('Photo uploads need CLOUDINARY_URL to be set — this host does not support saving files to local disk.');
    }
    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.buffer);
    return `/uploads/${filename}`;
}

function buildItemQuery(query, userEmail) {
    const dbQuery = {};
    if (query.type === 'lost' || query.type === 'found') dbQuery.type = query.type;
    if (query.category && CATEGORIES.includes(query.category)) dbQuery.category = query.category;
    if (query.resolved === 'true') dbQuery.resolved = true;
    else if (query.resolved !== 'all') dbQuery.resolved = { $ne: true };
    if (query.saved === 'true' && userEmail) dbQuery.savedBy = userEmail;
    if (query.search) {
        dbQuery.$or = [
            { title: { $regex: query.search, $options: 'i' } },
            { description: { $regex: query.search, $options: 'i' } },
            { location: { $regex: query.search, $options: 'i' } }
        ];
    }
    return dbQuery;
}

function serializeItem(item, userEmail) {
    return {
        id: item._id,
        title: item.title,
        description: item.description,
        type: item.type,
        category: item.category,
        location: item.location,
        reward: item.reward,
        rewardAmount: item.rewardAmount,
        image: item.image,
        resolved: item.resolved,
        postedBy: item.postedBy,
        canManage: !!(item.postedByEmail && item.postedByEmail === userEmail),
        saved: userEmail ? item.savedBy.includes(userEmail) : false,
        savedCount: item.savedBy.length,
        createdAt: item.createdAt
    };
}

// Board-wide counts change relatively rarely compared to how often pages are
// browsed, so they're cached for a few seconds and explicitly invalidated
// whenever an item is created, resolved, or deleted. This turns "4 counts on
// every navigation" into "usually 0 extra round trips".
let statsCache = { data: null, expires: 0 };
async function getStats() {
    if (statsCache.data && Date.now() < statsCache.expires) return statsCache.data;
    const [result] = await Item.aggregate([
        {
            $facet: {
                total: [{ $count: 'n' }],
                lost: [{ $match: { type: 'lost', resolved: { $ne: true } } }, { $count: 'n' }],
                found: [{ $match: { type: 'found', resolved: { $ne: true } } }, { $count: 'n' }],
                resolved: [{ $match: { resolved: true } }, { $count: 'n' }]
            }
        }
    ]);
    const pick = (arr) => (arr && arr[0] ? arr[0].n : 0);
    const stats = {
        total: pick(result.total),
        lostCount: pick(result.lost),
        foundCount: pick(result.found),
        resolvedCount: pick(result.resolved)
    };
    statsCache = { data: stats, expires: Date.now() + 8000 };
    return stats;
}
function invalidateStats() { statsCache = { data: null, expires: 0 }; }

// The client-side navigator (public/js/app.js) sends this header when it
// only needs the inner content, not the full document with head/nav — that
// lets the server skip re-rendering and re-sending the shell every time.
const isPjax = (req) => req.get('X-Pjax') === '1';

// ========================================================
// 6. VIEW ROUTES (SERVER-RENDERED PAGES)
// ========================================================
app.get('/', (req, res) => res.redirect(req.session.userId ? '/board' : '/login'));
app.get('/signup', (req, res) => res.render('signup', { error: null }));
app.get('/login', (req, res) => res.render('login', { error: null }));

app.get('/board', requireAuth, async (req, res) => {
    try {
        const dbQuery = buildItemQuery(req.query, req.session.userEmail);
        const [items, stats] = await Promise.all([
            Item.find(dbQuery).sort({ createdAt: -1 }).lean(),
            getStats()
        ]);

        res.render('board', {
            user: currentUser(req),
            userEmail: req.session.userEmail || '',
            search: req.query.search || '',
            activeType: req.query.type || 'all',
            activeCategory: req.query.category || 'all',
            activeSaved: req.query.saved === 'true',
            items,
            categories: CATEGORIES,
            stats,
            pjax: isPjax(req)
        });
    } catch (error) {
        console.error(error);
        res.render('board', {
            user: currentUser(req), userEmail: req.session.userEmail || '', search: '', activeType: 'all',
            activeCategory: 'all', activeSaved: false, items: [], categories: CATEGORIES,
            stats: { total: 0, lostCount: 0, foundCount: 0, resolvedCount: 0 }, pjax: isPjax(req)
        });
    }
});

app.get('/profile', requireAuth, async (req, res) => {
    try {
        const email = req.session.userEmail;
        const [result] = await Item.aggregate([
            {
                $facet: {
                    items: [{ $match: { postedByEmail: email } }, { $sort: { createdAt: -1 } }],
                    resolvedCount: [{ $match: { postedByEmail: email, resolved: true } }, { $count: 'n' }],
                    savedCount: [{ $match: { savedBy: email } }, { $count: 'n' }]
                }
            }
        ]);
        const pick = (arr) => (arr && arr[0] ? arr[0].n : 0);
        res.render('profile', {
            user: currentUser(req),
            email,
            items: result.items,
            savedCount: pick(result.savedCount),
            resolvedCount: pick(result.resolvedCount),
            userEmail: email,
            pjax: isPjax(req)
        });
    } catch (error) {
        console.error(error);
        res.render('profile', { user: currentUser(req), email: req.session.userEmail || '', items: [], savedCount: 0, resolvedCount: 0, userEmail: req.session.userEmail || '', pjax: isPjax(req) });
    }
});

app.get('/post-item', requireAuth, (req, res) => {
    res.render('post-item', { user: currentUser(req), error: null, categories: CATEGORIES, locations: LOCATIONS, userEmail: req.session.userEmail || '', pjax: isPjax(req) });
});

// ========================================================
// 7. FORM ACTION HANDLERS (classic form POSTs, no JS required)
// ========================================================
app.post('/signup', async (req, res) => {
    try {
        const { name, email, password, confirmPassword } = req.body;
        if (!name || !email || !password) return res.render('signup', { error: 'Please fill in all fields.' });
        if (password !== confirmPassword) return res.render('signup', { error: 'Passwords do not match.' });
        if (password.length < 6) return res.render('signup', { error: 'Password must be at least 6 characters.' });

        const cleanEmail = email.toLowerCase().trim();
        const existingUser = await User.findOne({ email: cleanEmail }).select('_id').lean();
        if (existingUser) return res.render('signup', { error: 'This email is already registered.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        await new User({ name, email: cleanEmail, password: hashedPassword }).save();
        res.redirect('/login');
    } catch (error) {
        console.error(error);
        res.render('signup', { error: 'Something went wrong. Please try again.' });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: (email || '').toLowerCase().trim() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.render('login', { error: 'Invalid email or password.' });
        }
        req.session.userId = user._id;
        req.session.userName = user.name;
        req.session.userEmail = user.email;
        res.redirect('/board');
    } catch (error) {
        console.error(error);
        res.render('login', { error: 'Server error during login.' });
    }
});

app.post('/post-item', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const { title, description, type, category, location, reward, rewardAmount, contactEmail } = req.body;
        if (!title) {
            return res.render('post-item', { user: currentUser(req), error: 'An item title is required.', categories: CATEGORIES, locations: LOCATIONS, userEmail: req.session.userEmail || '', pjax: false });
        }
        const imageUrl = await storeImage(req.file);
        await new Item({
            title,
            description,
            type: type === 'found' ? 'found' : 'lost',
            category: CATEGORIES.includes(category) ? category : 'other',
            location: location || 'Central Library',
            reward: reward === 'on' || reward === 'true',
            rewardAmount: rewardAmount || '',
            image: imageUrl,
            postedBy: req.session.userName || 'Anonymous Student',
            postedByEmail: EMAIL_RE.test(contactEmail || '') ? contactEmail.trim() : (req.session.userEmail || ''),
            userId: req.session.userId
        }).save();
        invalidateStats();
        res.redirect('/board');
    } catch (error) {
        console.error('Item posting error:', error);
        res.render('post-item', { user: currentUser(req), error: 'Something went wrong while posting your item.', categories: CATEGORIES, locations: LOCATIONS, userEmail: req.session.userEmail || '', pjax: false });
    }
});

app.post('/board/resolve/:id', requireAuth, async (req, res) => {
    try {
        await Item.findByIdAndUpdate(req.params.id, { resolved: true });
        invalidateStats();
    } catch (error) { console.error(error); }
    res.redirect('/board');
});

app.post('/board/delete/:id', requireAuth, async (req, res) => {
    try {
        const item = await Item.findById(req.params.id).select('postedByEmail').lean();
        if (item && item.postedByEmail === req.session.userEmail) {
            await Item.findByIdAndDelete(req.params.id);
            invalidateStats();
        }
    } catch (error) { console.error(error); }
    res.redirect('/board');
});

app.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// ========================================================
// 8. JSON REST API  (powers the AJAX-driven UI, and can be used by
//    any future mobile / third-party client)
// ========================================================
const api = express.Router();

api.post('/auth/signup', async (req, res) => {
    try {
        const { name, email, password, confirmPassword } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, error: 'Please fill in all fields.' });
        if (password !== confirmPassword) return res.status(400).json({ success: false, error: 'Passwords do not match.' });
        if (password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });

        const cleanEmail = email.toLowerCase().trim();
        const existingUser = await User.findOne({ email: cleanEmail }).select('_id').lean();
        if (existingUser) return res.status(409).json({ success: false, error: 'This email is already registered.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await new User({ name, email: cleanEmail, password: hashedPassword }).save();
        req.session.userId = user._id;
        req.session.userName = user.name;
        req.session.userEmail = user.email;
        res.status(201).json({ success: true, redirect: '/board', user: { name: user.name, email: user.email } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

api.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: (email || '').toLowerCase().trim() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ success: false, error: 'Invalid email or password.' });
        }
        req.session.userId = user._id;
        req.session.userName = user.name;
        req.session.userEmail = user.email;
        res.json({ success: true, redirect: '/board', user: { name: user.name, email: user.email } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server error during login.' });
    }
});

api.post('/auth/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true, redirect: '/login' }));
});

api.get('/stats', async (req, res) => {
    const stats = await getStats();
    res.json({ success: true, stats });
});

api.get('/items', requireAuthApi, async (req, res) => {
    try {
        const dbQuery = buildItemQuery(req.query, req.session.userEmail);
        const items = await Item.find(dbQuery).sort({ createdAt: -1 }).lean();
        res.json({ success: true, items: items.map(i => serializeItem(i, req.session.userEmail)) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Could not load items.' });
    }
});

api.post('/items', requireAuthApi, upload.single('image'), async (req, res) => {
    try {
        const { title, description, type, category, location, reward, rewardAmount, contactEmail } = req.body;
        if (!title) return res.status(400).json({ success: false, error: 'An item title is required.' });

        const imageUrl = await storeImage(req.file);
        const item = await new Item({
            title,
            description,
            type: type === 'found' ? 'found' : 'lost',
            category: CATEGORIES.includes(category) ? category : 'other',
            location: location || 'Central Library',
            reward: reward === 'on' || reward === 'true' || reward === true,
            rewardAmount: rewardAmount || '',
            image: imageUrl,
            postedBy: req.session.userName || 'Anonymous Student',
            postedByEmail: EMAIL_RE.test(contactEmail || '') ? contactEmail.trim() : (req.session.userEmail || ''),
            userId: req.session.userId
        }).save();

        invalidateStats();
        res.status(201).json({ success: true, item: serializeItem(item, req.session.userEmail) });
    } catch (error) {
        console.error('Item posting error:', error);
        res.status(500).json({ success: false, error: 'Something went wrong while posting your item.' });
    }
});

api.patch('/items/:id/resolve', requireAuthApi, async (req, res) => {
    try {
        const item = await Item.findByIdAndUpdate(req.params.id, { resolved: true }, { new: true });
        if (!item) return res.status(404).json({ success: false, error: 'Item not found.' });
        invalidateStats();
        res.json({ success: true, item: serializeItem(item, req.session.userEmail) });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Could not update item.' });
    }
});

api.patch('/items/:id/save', requireAuthApi, async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        if (!item) return res.status(404).json({ success: false, error: 'Item not found.' });
        const email = req.session.userEmail;
        const idx = item.savedBy.indexOf(email);
        if (idx === -1) item.savedBy.push(email);
        else item.savedBy.splice(idx, 1);
        await item.save();
        res.json({ success: true, saved: idx === -1, savedCount: item.savedBy.length });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Could not update item.' });
    }
});

api.delete('/items/:id', requireAuthApi, async (req, res) => {
    try {
        const item = await Item.findById(req.params.id).select('postedByEmail').lean();
        if (!item) return res.status(404).json({ success: false, error: 'Item not found.' });
        if (item.postedByEmail !== req.session.userEmail) {
            return res.status(403).json({ success: false, error: 'You can only delete items you posted.' });
        }
        await Item.findByIdAndDelete(req.params.id);
        invalidateStats();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Could not delete item.' });
    }
});

app.use('/api', api);

// Friendly JSON error handler for API routes (e.g. multer file-size errors)
app.use('/api', (err, req, res, next) => {
    console.error(err);
    res.status(400).json({ success: false, error: err.message || 'Request failed.' });
});

app.listen(PORT, () => console.log(`Server is running smoothly on port ${PORT}`));
