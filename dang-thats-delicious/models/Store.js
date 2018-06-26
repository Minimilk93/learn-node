const mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const slug = require('slugs');

const storeSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        required: 'Name is required'
    },
    slug: String,
    description: {
        type: String,
        trim: true,
    },
    tags: [String],
    created: {
        type: Date,
        default: Date.now
    },
    location: {
        type: {
            type: String,
            default: 'Point'
        },
        coordinates: [{
            type: Number,
            required: 'You must supply coordinates',
        }],
        address: {
            type: String,
            required: 'You must supply an address!'
        }
    },
    photo: String,
    author: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: 'You must supply an author'
    }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Define indexes - easier and faster queries!
storeSchema.index({
    name: 'text',
    description: 'text'
});

storeSchema.index({ location: '2dsphere' });

// Take name passed in and pass to slug package

storeSchema.pre('save', async function(next) {
    if (!this.isModified('name')) {
        next();
        return;
    }
    this.slug = slug(this.name);

    // Find Other stores with same slug
    const slugRegEx = new RegExp(`^(${this.slug})((-[0-9]*$)?)$`, 'i')
    const storesWithSlug = await this.constructor.find({ slug: slugRegEx });

    if(storesWithSlug.length) {
        this.slug = `${this.slug}-${storesWithSlug.length + 1}`;
    }
    next();

    // TODO make more resilient slugs
});

// Aggregate and return list of tags by id from each instance of store
storeSchema.statics.getTagsList = function() {
    return this.aggregate([
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);
};

storeSchema.statics.getTopStores = function() {
    return this.aggregate([
        // Lookup stores and populate their reviews
        { $lookup: {
            from: 'reviews', 
            localField: '_id', 
            foreignField: 'store', 
            as: 'reviews'}
        },
        // filter for only items that have 2 or more reviews the dot is for indexing.
        { $match: { 
            'reviews.1': { $exists: true }
        }},
        // Add average reviews field
        { $addFields: {
            averageRating: { $avg: '$reviews.rating' }
        }},
        // sort it by our new field, highest reviews first
        { $sort: { averageRating: -1 }},
        // limit to ten
        { $limit: 10 }
    ]);
}

// find reviews where the stores _id property equals reviews store property
storeSchema.virtual('reviews', {
    ref: 'Review', //which model to link?
    localField: '_id', //which field on the store
    foreignField: 'store' // which field on review?
});

function autopopulate(next) {
    this.populate('reviews');
    next();
}

storeSchema.pre('find', autopopulate);
storeSchema.pre('findOne', autopopulate);

module.exports = mongoose.model('Store', storeSchema);
