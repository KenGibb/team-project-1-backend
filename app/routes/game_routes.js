// Express docs: http://expressjs.com/en/api.html
const express = require('express')
// Passport docs: http://www.passportjs.org/docs/
const passport = require('passport')

// get our env file for the api
require('dotenv').config()

// pull in Mongoose model for games
const Game = require('../models/game')

// this is a collection of methods that help us detect situations when we need
// to throw a custom error
const customErrors = require('../../lib/custom_errors')

// we'll use this function to send 404 when non-existant document is requested
const handle404 = customErrors.handle404
// we'll use this function to send 401 when a user tries to modify a resource
// that's owned by someone else
const requireOwnership = customErrors.requireOwnership

// this is middleware that will remove blank fields from `req.body`, e.g.
// { game: { title: '', text: 'foo' } } -> { game: { text: 'foo' } }
const removeBlanks = require('../../lib/remove_blank_fields')
const { default: axios } = require('axios')
// passing this as a second argument to `router.<verb>` will make it
// so that a token MUST be passed for that route to be available
// it will also set `req.user`
const requireToken = passport.authenticate('bearer', { session: false })

// instantiate a router (mini app that only handles routes)
const router = express.Router()

// INDEX
// GET /games
router.get('/games', (req, res, next) => {
	Game.find()
		.populate('owner')
		.then((games) => {
			// `games` will be an array of Mongoose documents
			// we want to convert each one to a POJO, so we use `.map` to
			// apply `.toObject` to each one
			return games.map((game) => game.toObject())
		})
		// respond with status 200 and JSON of the games
		.then((games) => res.status(200).json({ games: games }))
		// if an error occurs, pass it to the handler
		.catch(next)
})

// SHOW
// GET /games/5a7db6c74d55bc51bdf39793
router.get('/games/:id', (req, res, next) => {
	// req.params.id will be set based on the `:id` in the route
	Game.findById(req.params.id)
		.populate('owner')
		.then(handle404)
		// if `findById` is succesful, respond with 200 and "game" JSON
		.then(game => {
			res.status(200).json({ game: game.toObject() })
		})
		// if an error occurs, pass it to the handler
		.catch(next)
})

// CREATE
// POST /games
router.post('/games', requireToken, async (req, res, next) => {
	let input = req.body
	// set owner of new game to be current user
	input.game.owner = req.user.id
	let gameTitle = input.game.title
	console.log(gameTitle)
	// check to see if the user input a game with a space if so replace the space with a -
	// this is to adhere to the way the api searches for a game
	if (gameTitle.includes(" ")) {
		gameTitle = gameTitle.replace(/ /g, "-");
	}

	await axios(`${process.env.RAWG_URL}${gameTitle}?key=${process.env.KEY}`)
		.then(handle404)
		.then(game => {
			// sets the description
			input.game.description = game.data.description.replace(/<\/?(p|br)[^>]*>/g, "")
			// sets the genre
			const genres = game.data.genres
			const genrenames = genres.map(genre => genre.name)
			input.game.genre = genrenames
			// sets the platform
			const platforms = game.data.parent_platforms
			const gamePlatforms = platforms.map(item => item.platform.name)
			input.game.platform = gamePlatforms
			// finally create the game
			Game.create(input.game)
				// respond to succesful `create` with status 201 and JSON of new "game"
				.then(game => {
					res.status(201).json({ game: game.toObject() })
				})
				// if an error occurs, pass it off to our error handler
				// the error handler needs the error message and the `res` object so that it
				// can send an error message back to the client
				.catch(next)
		})
		// .then(game => res.status(201).json({ game: game.toObject() }))
		.catch(next)
})

// UPDATE
// PATCH /games/5a7db6c74d55bc51bdf39793
router.patch('/games/:id', requireToken, removeBlanks, (req, res, next) => {
	// if the client attempts to change the `owner` property by including a new
	// owner, prevent that by deleting that key/value pair
	delete req.body.game.owner

	Game.findById(req.params.id)
		.then(handle404)
		.then((game) => {
			// pass the `req` object and the Mongoose record to `requireOwnership`
			// it will throw an error if the current user isn't the owner
			requireOwnership(req, game)

			// pass the result of Mongoose's `.update` to the next `.then`
			return game.updateOne(req.body.game)
		})
		// if that succeeded, return 204 and no JSON
		.then(() => res.sendStatus(204))
		// if an error occurs, pass it to the handler
		.catch(next)
})

// DESTROY
// DELETE /games/5a7db6c74d55bc51bdf39793
router.delete('/games/:id', requireToken, (req, res, next) => {
	Game.findById(req.params.id)
		.then(handle404)
		.then((game) => {
			// throw an error if current user doesn't own `game`
			requireOwnership(req, game)
			// delete the game ONLY IF the above didn't throw
			game.deleteOne()
		})
		// send back 204 and no content if the deletion succeeded
		.then(() => res.sendStatus(204))
		// if an error occurs, pass it to the handler
		.catch(next)
})

module.exports = router
