var express = require('express');
var bodyParser = require('body-parser');
var mysql = require('mysql');
var http = require('http');
var fs = require('fs');
var validator = require('validator');
var bcrypt = require('bcrypt');
var session = require('express-session');
var url = require('url');

// Load environment variables
require('dotenv').config();

const port = process.env.PORT;
const saltRounds = 14;
const crypto = require('crypto');

// Setup Express
var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: true
}));

// Setup session
app.set('trust proxy', 1);
app.use(session({
	name: process.env.COOKIE_NAME,
	secret: process.env.COOKIE_SECRET,
	resave: false,
	saveUninitialized: false,
	cookie: { domain: process.env.COOKIE_DOMAIN, httpOnly: true, secure: true, maxAge: 31536000000 }
}));

// Setup MySQL
var dbConnection = mysql.createConnection({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
	database: process.env.DB_NAME
});

// Setup server
var httpServer = http.createServer(app);

// Setup Socket.IO
var io = require('socket.io')(httpServer);
var socketStreams = {};
io.on('connection', (socket) => {
	socket.on('disconnect', () => {
		if (socketStreams.hasOwnProperty(socket.id)) {
			io.in(socketStreams[socket.id]).clients((error, clients) => {
				if (error) throw error;
				io.to(socketStreams[socket.id]).emit('updateViewers', clients.length);
				delete socketStreams[socket.id];
			});
		}
	});
	socket.on('joinStream', (stream, fn) => {
		if (validateUsername(stream)) {
			socketStreams[socket.id] = stream;
			socket.join(stream);
			io.in(stream).clients((error, clients) => {
				if (error) throw error;
				io.to(stream).emit('updateViewers', clients.length);
				fn();
			});
		}
	});
	socket.on('message', (data) => {
		if (socketStreams.hasOwnProperty(socket.id) && validateUsername(data.username) && validateMessage(data.message)) {
			io.to(socketStreams[socket.id]).emit('message', {username: data.username, message: data.message, date: Date.now()});
		}
	});
});

// Listen on port
httpServer.listen(port, function (error) {
	if (error) throw error;
	console.log('Server listening on port ' + port + '.');
});

// Called when a stream is started
app.post('/api/start_stream', function (req, res) {
	if (!req.body || !req.body.name) {
		// If request does not contain stream key
		return res.sendStatus(400);
	}
	// Validate stream key
	if (!validateStreamKey(req.body.name)) {
		return res.sendStatus(403);
	}
	startStream(req.body.name, res);
});

// Called when a stream is stopped
app.post('/api/stop_stream', function (req, res) {
	if (!req.body || !req.body.name) {
		// If request does not contain stream key
		return;
	}
	// Validate stream key
	if (!validateStreamKey(req.body.name)) {
		return;
	}
	if (streams.hasOwnProperty(req.body.name)) {
		stopStream(req.body.name);
	}
});

// Called when user attempts registration
app.post('/api/register', function (req, res) {
	if (!req.body || !req.body.username || !req.body.password) {
		return res.status(400).json({response: 'Invalid POST request'});
	}
	// Validate username
	if (!validateUsername(req.body.username)) {
		return res.status(400).json({response: 'Invalid username'});
	}
	// Validate password
	if (!validatePassword(req.body.password)) {
		return res.status(400).json({response: 'Invalid password'});
	}
	register(req.body.username, req.body.password, res);
});

// Called when user attempts to log in
app.post('/api/login', function (req, res) {
	if (!req.body || !req.body.username || !req.body.password) {
		return res.status(400).json({response: 'Invalid POST request'});
	}
	// If session authenticated
	if (req.session && req.session.authenticated && req.session.authenticated === true) {
		return res.status(400).json({response: 'Already logged in'});
	}
	// Validate username
	if (!validateUsername(req.body.username)) {
		return res.status(400).json({response: 'Invalid username or password'});
	}
	// Validate password
	if (!validatePassword(req.body.password)) {
		return res.status(400).json({response: 'Invalid username or password'});
	}
	login(req.body.username, req.body.password, req, res);
});

// Checks if session is authenticated
app.get('/api/check_authenticated', function (req, res) {
	// If session authenticated
	if (req.session && req.session.authenticated && req.session.authenticated === true) {
		return res.status(200).json({response: 'Authenticated', username: req.session.username});
	}
	return res.status(400).json({response: 'Not authenticated'});
});

// Called when user attempts to log out
app.get('/api/logout', function (req, res) {
	// If session not authenticated
	if (!req.session || !req.session.authenticated || req.session.authenticated !== true) {
		return res.status(400).json({response: 'Not logged in'});
	}
	logout(req, res);
});

// Called when user attempts to delete account
app.post('/api/delete_account', function (req, res) {
	if (!req.body || !req.body.password) {
		return res.status(400).json({response: 'Invalid POST request'});
	}
	// If session not authenticated
	if (!req.session || !req.session.authenticated || req.session.authenticated !== true) {
		return res.status(400).json({response: 'Not logged in'});
	}
	// Validate password
	if (!validatePassword(req.body.password)) {
		return res.status(400).json({response: 'Invalid password'});
	}
	deleteAccount(req.body.password, req, res);
});

// Called when user views stream key
app.get('/api/get_stream_key', function (req, res) {
	// If session not authenticated
	if (!req.session || !req.session.authenticated || req.session.authenticated !== true) {
		return res.status(400).json({response: 'Not logged in'});
	}
	getStreamKey(req, res);
});

// Called when user attempts to change stream key
app.get('/api/change_stream_key', function (req, res) {
	// If session not authenticated
	if (!req.session || !req.session.authenticated || req.session.authenticated !== true) {
		return res.status(400).json({response: 'Not logged in'});
	}
	changeStreamKey(req, res);
});

// Called when displaying all streams
app.get('/api/get_streams', function (req, res) {
	getStreams(res);
});

// Called when viewing individual stream
app.post('/api/check_user_exists', function (req, res) {
	if (!req.body || !req.body.username) {
		return res.status(400).json({response: 'Invalid POST request'});
	}
	// Validate username
	if (!validateUsername(req.body.username)) {
		return res.status(400).json({response: 'Invalid username'});
	}
	checkUserExists(req.body.username, req, res);
});

// Called when viewing individual stream
app.post('/api/check_user_live', function (req, res) {
	if (!req.body || !req.body.username) {
		return res.status(400).json({response: 'Invalid POST request'});
	}
	// Validate username
	if (!validateUsername(req.body.username)) {
		return res.status(400).json({response: 'Invalid username'});
	}
	checkUserLive(req.body.username, req, res);
});

// Called when request made for stream thumbnail
app.get("/thumbnails/*.png", function (req, res) {
	res.sendFile(__dirname + url.parse(req.url).pathname, function (err) {
		if (err) {
			res.sendFile(__dirname + '/default_thumbnail.png', function (err) {
				if (err) throw err;
			});
		}
	});
});

// Validates a user ID
function validateUid(uid) {
	return !validator.isEmpty(uid) && validator.isHexadecimal(uid) && validator.isLength(uid, {min: 16, max: 16});
}

// Validates a username
function validateUsername(username) {
	return !validator.isEmpty(username) && validator.isAlphanumeric(username) && validator.isLength(username, {min: 4, max: 32});
}

// Validates a password
function validatePassword(password) {
	return !validator.isEmpty(password) && validator.isAscii(password) && validator.isLength(password, {min: 8, max: 64});
}

// Validates a stream key
function validateStreamKey(streamKey) {
	return !validator.isEmpty(streamKey) && validator.isHexadecimal(streamKey) && validator.isLength(streamKey, {min: 64, max: 64});
}

// Validates a message
function validateMessage(message) {
	return !validator.isEmpty(message) && validator.isLength(message, {min: 1, max: 512});
}

// Stream objects
const { spawn } = require('child_process');
var streams = {};

// Initializes new stream
function startStream(streamKey, res) {
	if (streams.hasOwnProperty(streamKey)) {
		// If already streaming
		return res.sendStatus(403);
	}
	// Get username for stream key
	var sql = 'SELECT ?? FROM ?? WHERE ??=?';
	var inserts = ['username', 'accounts', 'stream_key', streamKey];
	dbConnection.query(sql, inserts, function (error, results) {
		if (error) throw error;
		if (results.length != 1) {
			return res.sendStatus(403);
		}
		// Stream key valid, start transcode process
		const t = spawn('./transcode', [streamKey, results[0].username], { stdio: 'ignore' });
		t.on('error', () => {
			console.log('Transcode process error.');
		});
		t.on('exit', () => {
			console.log('Transcode process terminated.');
		});
		// Add stream to streams object
		streams[streamKey] = {username: results[0].username, transcode: t};
		console.log('Transcode process spawned.');
		res.sendStatus(200);
		console.log('Stream started.');
	});
}

// Terminates stream
function stopStream(streamKey) {
	// Stop transcode process
	streams[streamKey].transcode.kill('SIGTERM');
	// Check if stream thumbnail exists
	fs.access('./thumbnails/' + streams[streamKey].username + '.png', fs.constants.F_OK, (err) => {
		if (!err) {
			// Delete stream thumbnail
			fs.unlink('./thumbnails/' + streams[streamKey].username + '.png', (err) => {
				if (err) throw err;
				delete streams[streamKey];
				console.log('Stream stopped.');
			});
		} else {
			delete streams[streamKey];
			console.log('Stream stopped.');
		}
	});
}

// Registers an account
function register(u, p, res) {
	// Check if username already exists
	var sql = 'SELECT ?? FROM ?? WHERE ??=?';
	var inserts = ['username', 'accounts', 'username', u];
	dbConnection.query(sql, inserts, function (error, results) {
		if (error) throw error;
		if (results.length != 0) {
			return res.status(400).json({response: 'Username exists'});
		}
		// Hash password
		bcrypt.hash(p, saltRounds, function (err, hash) {
			// Generate user ID and stream key and check if already exist
			var uid = crypto.randomBytes(8).toString('hex');
			var streamKey = crypto.randomBytes(32).toString('hex');
			var sql = 'SELECT ?? FROM ?? WHERE ??=? OR ??=?';
			var inserts = ['uid', 'accounts', 'uid', uid, 'stream_key', streamKey];
			dbConnection.query(sql, inserts, function (error, results) {
				if (error) throw error;
				if (results.length != 0) {
					return res.status(500).json({response: 'Collision'});
				}
				// Insert account in accounts table
				var sql = 'INSERT INTO ?? SET ?';
				var inserts = ['accounts', {'uid': uid, 'username': u, 'password': hash, 'stream_key': streamKey}];
				dbConnection.query(sql, inserts, function (error, results) {
					if (error) throw error;
					if (results.affectedRows != 1) {
						return res.status(500).json({response: 'Registration error'});
					}
					console.log('Account registered.');
					return res.status(200).json({response: 'Registration successful'});
				});
			});
		});
	});
}

// Logs a user in
function login(u, p, req, res) {
	// Get user ID and password hash for username
	var sql = 'SELECT ??,?? FROM ?? WHERE ??=?';
	var inserts = ['uid', 'password', 'accounts', 'username', u];
	dbConnection.query(sql, inserts, function (error, results) {
		if (error) throw error;
		if (results.length != 1) {
			return res.status(400).json({response: 'Invalid username or password'});
		}
		// Compare sent password hash to account password hash
		bcrypt.compare(p, results[0].password, function (err, result) {
			if (result === true) {
				// Setup session
				req.session.authenticated = true;
				req.session.uid = results[0].uid;
				req.session.username = u;
				console.log('User logged in.');
				return res.status(200).json({response: 'Login successful', username: req.session.username});
			} else {
				return res.status(400).json({response: 'Invalid username or password'});
			}
		});
	});
}

// Logs a user out
function logout(req, res) {
	// Destroy the session
	req.session.destroy(function (err) {
		if (err) throw err;
		console.log('User logged out.');
		return res.status(200).json({response: 'Logout successful'});
	});
}

// Deletes an account
function deleteAccount(p, req, res) {
	// Get password hash for user ID
	var sql = 'SELECT ?? FROM ?? WHERE ??=?';
	var inserts = ['password', 'accounts', 'uid', req.session.uid];
	dbConnection.query(sql, inserts, function (error, results) {
		if (error) throw error;
		if (results.length != 1) {
			return res.status(500).json({response: 'User ID not found'});
		}
		// Compare sent password hash to account password hash
		bcrypt.compare(p, results[0].password, function (err, result) {
			if (result === true) {
				// Delete account
				var sql = 'DELETE FROM ?? WHERE ??=?';
				var inserts = ['accounts', 'uid', req.session.uid];
				dbConnection.query(sql, inserts, function (error, results) {
					if (error) throw error;
					if (results.affectedRows != 1) {
						return res.status(500).json({response: 'Account deletion error'});
					}
					// Destroy the session
					req.session.destroy(function (err) {
						if (err) throw err;
						console.log('Account deleted.');
						return res.status(200).json({response: 'Account deletion successful'});
					});
				});
			} else {
				return res.status(400).json({response: 'Invalid password'});
			}
		});
	});
}

// Gets stream key of an account
function getStreamKey(req, res) {
	// Get stream key for user ID
	var sql = 'SELECT ?? FROM ?? WHERE ??=?';
	var inserts = ['stream_key', 'accounts', 'uid', req.session.uid];
	dbConnection.query(sql, inserts, function (error, results) {
		if (error) throw error;
		if (results.length != 1) {
			return res.status(500).json({response: 'Stream key not found'});
		}
		return res.status(200).json({response: 'Success', streamKey: results[0].stream_key});
	});
}

// Changes stream key of an account
function changeStreamKey(req, res) {
	// Get stream key for user ID
	var sql = 'SELECT ?? FROM ?? WHERE ??=?';
	var inserts = ['stream_key', 'accounts', 'uid', req.session.uid];
	dbConnection.query(sql, inserts, function (error, results) {
		if (error) throw error;
		if (results.length != 1) {
			return res.status(500).json({response: 'Stream key not found'});
		}
		// Stop current stream
		if (streams.hasOwnProperty(results[0].stream_key)) {
			stopStream(results[0].stream_key);
		}
		// Generate new stream key and check if already exists
		var newStreamKey = crypto.randomBytes(32).toString('hex');
		var sql = 'SELECT ?? FROM ?? WHERE ??=?';
		var inserts = ['stream_key', 'accounts', 'stream_key', newStreamKey];
		dbConnection.query(sql, inserts, function (error, results) {
			if (error) throw error;
			if (results.length != 0) {
				return res.status(500).json({response: 'Stream key collision'});
			}
			// Change stream key for user ID
			var sql = 'UPDATE ?? SET ??=? WHERE ??=?';
			var inserts = ['accounts', 'stream_key', newStreamKey, 'uid', req.session.uid];
			dbConnection.query(sql, inserts, function (error, results) {
				if (error) throw error;
				if (results.affectedRows != 1) {
					return res.status(500).json({response: 'Error changing stream key'});
				}
				console.log('Stream key changed.');
				return res.status(200).json({response: 'Success', streamKey: newStreamKey});
			});
		});
	});
}

// Returns the usernames of everyone currently streaming
function getStreams(res) {
	var u = [];
	for (var streamKey in streams) {
		if (streams.hasOwnProperty(streamKey)) {
			u.push(streams[streamKey].username);
		}
	}
	return res.status(200).json({response: 'Success', usernames: u});
}

// Checks if a user exists
function checkUserExists(u, req, res) {
	var sql = 'SELECT ?? FROM ?? WHERE ??=?';
	var inserts = ['username', 'accounts', 'username', u];
	dbConnection.query(sql, inserts, function (error, results) {
		if (error) throw error;
		if (results.length != 1) {
			return res.status(400).json({response: 'User does not exist'});
		}
		return res.status(200).json({response: 'User exists'});
	});
}

// Checks if a user is live
function checkUserLive(u, req, res) {
	for (var streamKey in streams) {
		if (streams.hasOwnProperty(streamKey) && streams[streamKey].username === u) {
			return res.status(200).json({response: 'User live'});
		}
	}
	return res.status(400).json({response: 'User is not live'});
}
