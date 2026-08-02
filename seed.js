// Populates the board with a demo account and a handful of realistic-looking
// sample reports so the UI has something to show right after setup.
// Run with: npm run seed

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/user');
const Item = require('./models/item');

const DEMO_EMAIL = 'demo.student@titan.edu.pk';
const DEMO_PASSWORD = 'demo1234';

const SAMPLE_ITEMS = [
    { title: 'Black Leather Wallet', description: 'Bifold wallet with a campus ID card visible through the window pocket. Lost near the cafeteria entrance.', type: 'lost', category: 'accessories', location: 'Cafeteria', reward: true, rewardAmount: 'Rs. 500', seed: 'wallet-titan' },
    { title: 'iPhone 13 - Blue Case', description: 'Silver iPhone with a cracked screen protector and a blue silicone case. Left on a study table.', type: 'lost', category: 'electronics', location: 'Central Library', reward: true, rewardAmount: 'Rs. 1500', seed: 'phone-titan' },
    { title: 'Set of 3 Keys on Carabiner', description: 'Two door keys and a bike lock key on a red carabiner clip.', type: 'found', category: 'keys', location: 'Main Parking Arena', reward: false, seed: 'keys-titan' },
    { title: 'Grey Herschel Backpack', description: 'Found near the engineering labs, contains a few notebooks and a calculator.', type: 'found', category: 'bags', location: 'Engineering Block', reward: false, seed: 'backpack-titan' },
    { title: 'Casio Scientific Calculator', description: 'FX-991 model with "M. Bilal" written on the back in marker.', type: 'lost', category: 'electronics', location: 'Admin Block', reward: false, seed: 'calculator-titan' },
    { title: 'Student ID Card', description: 'Found tucked inside a library book on the second floor.', type: 'found', category: 'documents', location: 'Central Library', reward: false, seed: 'idcard-titan' },
    { title: 'Navy Blue Hoodie (M)', description: 'Left behind on the bleachers after practice. No visible name tag.', type: 'found', category: 'clothing', location: 'Sports Complex', reward: false, seed: 'hoodie-titan' },
    { title: 'Wired Earphones - White', description: 'Apple-style earphones in a small pouch, lost somewhere between the hostel and the auditorium.', type: 'lost', category: 'electronics', location: 'Hostel Block', reward: false, seed: 'earphones-titan' },
];

async function seed() {
    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is not set in .env — cannot seed the database.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database.');

    let user = await User.findOne({ email: DEMO_EMAIL });
    if (!user) {
        const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
        user = await new User({ name: 'Demo Student', email: DEMO_EMAIL, password: hashedPassword }).save();
        console.log(`Created demo account -> ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    } else {
        console.log('Demo account already exists, reusing it.');
    }

    const existingCount = await Item.countDocuments({ postedByEmail: DEMO_EMAIL });
    if (existingCount > 0) {
        console.log(`Demo account already has ${existingCount} item(s) — skipping item seed. Delete them first if you want to reseed.`);
    } else {
        const docs = SAMPLE_ITEMS.map(item => ({
            title: item.title,
            description: item.description,
            type: item.type,
            category: item.category,
            location: item.location,
            reward: item.reward,
            rewardAmount: item.rewardAmount || '',
            image: `https://picsum.photos/seed/${item.seed}/600/450`,
            postedBy: user.name,
            postedByEmail: user.email,
            userId: user._id
        }));
        await Item.insertMany(docs);
        console.log(`Seeded ${docs.length} sample items.`);
    }

    await mongoose.disconnect();
    console.log('Done. Log in with the demo account above to see the board populated.');
}

seed().catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
});
