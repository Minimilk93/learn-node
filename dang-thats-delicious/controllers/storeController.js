const mongoose = require('mongoose');
const Store = mongoose.model('Store');
const multer = require('multer');
const jimp = require('jimp');
const uuid = require('uuid');
const User = mongoose.model('User');

const multerOptions = {
    storage: multer.memoryStorage(),
    fileFilter(req, file, next) {
        const isPhoto = file.mimetype.startsWith('image/');
        if(isPhoto) {
            next(null, true);

        } else {
            next({ message: 'That filetype is not allowed!' }, false);
        }
    }
}

exports.homePage = (req, res) => {
    req.flash('success', `Successfully created`)
    res.render('index');
}

exports.addStore = (req, res) => {
    res.render('editStore', { title: 'Add Store'});
}

// Middleware - store in memory of server. Its temporary as we are resizing it.
exports.upload = multer(multerOptions).single('photo');

exports.resize = async (req, res, next) => {
    // check if there is no new file to resize
    if(!req.file) {
        next();
        return;
    }
    const extension = req.file.mimetype.split('/')[1];
    req.body.photo = `${uuid.v4()}.${extension}`;

    // Now we resize
    const photo = await jimp.read(req.file.buffer);
    await photo.resize(800, jimp.AUTO);
    await photo.write(`./public/uploads/${req.body.photo}`);

    // Once we have written to filesys, keep going!
    next();
}

exports.createStore = async (req, res) => {
    req.body.author = req.user._id;
    const store = await (new Store(req.body)).save();
    await store.save();
    req.flash('success', `Successfully created ${store.name}. Care to leave a review?`)
    res.redirect(`/store/${store.slug}`);
}

exports.getStores = async (req, res) => {
    const page = req.params.page || 1;
    const limit = 4;
    const skip = (page * limit) - limit;
    const storesPromise = Store
        .find()
        .skip(skip)
        .limit(limit)
        .sort({ created: 'desc' });

    const countPromise = Store.count();
    const [stores, count] = await Promise.all([storesPromise, countPromise]);
    const pages = Math.ceil(count / limit);

    if(!stores.length && skip) {
        req.flash('info', `Hey your asked for ${page} but it doesnt exist`);
        res.redirect(`/stores/page/${pages}`)
    }

    res.render('stores', { title: 'Stores', stores, pages, page, count });
};

const confirmOwner = (store, user) => {
    if(!store.author.equals(user._id)) {
        throw Error('You must own a store in order to edit it');
    }
}

exports.editStore = async (req, res) => {
    const store = await Store.findOne({ _id: req.params.id });

    confirmOwner(store, req.user);

    res.render('editStore', { title: 'Edit Store', store });
};

exports.updateStore = async (req, res) => {
    req.body.location.type = 'Point';

    const store = await Store.findOneAndUpdate({ _id: req.params.id }, req.body, {
        new: true, // return new store instead of old one
        runValidators: true
    }).exec();

    req.flash('success', `Successfully updated ${store.name} <a href="/stores/${store.slug}">View Store</a>`);

    res.redirect(`stores/${store._id}/edit`);
};
// populate gets the authors details rather than their id
exports.getStoreBySlug = async (req, res, next) => {
    const store = await Store.findOne({ slug: req.params.slug }).populate('author reviews');

    // Move to next middleware which is the 404 error handler see app.js
    if(!store) return next();

    res.render('store', { store, title: store.name })
}

// Get tag from request
// If there is no tag return all where a tag exists
// Multiple promises defined and then we await both of these promises which we destructure
// We then return the tags and the stores with the tagQuery returned by the request

exports.getStoresByTag = async (req, res) => {
    const tag = req.params.tag;
    const tagQuery = tag || { $exists: true };
    const tagsPromise = Store.getTagsList();
    const storesPromise = Store.find({ tags: tagQuery })
    const [tags, stores] = await Promise.all([tagsPromise, storesPromise]);

    res.render('tag', { tags, title: 'Tags', tag, stores })
}

// Projected meta text score to measure relevancy
exports.searchStores = async (req, res) => {
    const stores = await Store
    // Find stores that match
    .find({
        $text: {
            $search: req.query.q,
        }
    }, {
        score: { $meta: 'textScore' }
    })
    // Sort for relevancy
    .sort({
        score: { $meta: 'textScore' }
    })
    .limit(5);

    res.json(stores);
}

exports.mapStores = async (req, res) => {
    const coordinates = [req.query.lng, req.query.lat].map(parseFloat);
    const q = {
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates
                },
                $maxDistance: 10000
            }
        }
    }

    const stores = await Store.find(q).select('slug name description location photo').limit(10);
    res.json(stores);
};

exports.mapPage = (req, res) => {
    res.render('map', { title: 'Map' });
}

exports.heartStore = async (req, res) => {
    const hearts = req.user.hearts.map(obj => obj.toString());
    const operator = hearts.includes(req.params.id) ? '$pull' : '$addToSet';
    const user = await User.findByIdAndUpdate(req.user._id,
        { [operator]: { hearts: req.params.id } },
        { new: true }
    );
    res.json(user);
}

exports.getHearts = async (req, res) => {
    const stores = await Store.find({
        _id: { $in: req.user.hearts }
    });

    res.render('stores', { title: 'Hearted stores', stores });
};

exports.getTopStores = async (req, res) => {
   const stores = await Store.getTopStores();
   res.render('topStores', { stores, title: 'Top Stores'})
}