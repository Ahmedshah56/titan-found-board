const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, required: true, enum: ['lost', 'found'], default: 'lost' },
    category: {
        type: String,
        enum: ['electronics', 'documents', 'keys', 'bags', 'accessories', 'clothing', 'books', 'other'],
        default: 'other'
    },
    location: { type: String, default: 'Central Library' },
    reward: { type: Boolean, default: false },
    rewardAmount: { type: String, default: '' },
    image: { type: String, default: null },
    resolved: { type: Boolean, default: false },
    postedBy: { type: String, default: 'Anonymous Student' },
    postedByEmail: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    savedBy: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.models.Item || mongoose.model('Item', itemSchema);
