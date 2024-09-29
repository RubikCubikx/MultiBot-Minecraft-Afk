const mineflayer = require('mineflayer');
const { Movements, pathfinder } = require('mineflayer-pathfinder');
const { GoalBlock, GoalXZ } = require('mineflayer-pathfinder').goals;

const config = require('./settings.json');
const loggers = require('./logging.js'); // Ensure this module exists
const logger = loggers.logger;

// Function to create and setup a bot
function setupBot(bot) {
    bot.loadPlugin(pathfinder);
    
    bot.once('spawn', () => {
        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        
        // Ensure bot settings are initialized
        if (!bot.settings) {
            bot.settings = {};
        }
        
        bot.settings.colorsEnabled = false;

        // Set movements for the bot
        bot.pathfinder.setMovements(defaultMove);

        logger.info(`${bot.username} joined the server`);

        if (config.utils['auto-auth'].enabled) {
            logger.info('Started auto-auth module');
            let password = config.utils['auto-auth'].password;
            setTimeout(() => {
                bot.chat(`/register ${password} ${password}`);
                bot.chat(`/login ${password}`);
            }, 500);
            logger.info(`Authentication commands executed`);
        }

        if (config.utils['chat-messages'].enabled) {
            logger.info('Started chat-messages module');
            let messages = config.utils['chat-messages']['messages'];
            if (config.utils['chat-messages'].repeat) {
                let delay = config.utils['chat-messages']['repeat-delay'];
                let i = 0;

                setInterval(() => {
                    if (messages[i]) bot.chat(`${messages[i]}`);
                    i = (i + 1) % messages.length; // Loop through messages
                }, delay * 1000);
            } else {
                messages.forEach((msg) => {
                    if (msg) bot.chat(msg); // Send non-empty messages
                });
            }
        }

        const pos = config.position;
        if (config.position.enabled) {
            logger.info(`Starting moving to target location (${pos.x}, ${pos.y}, ${pos.z})`);
            bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
        }

        if (config.utils['anti-afk'].enabled) {
            setupAntiAFK(bot);
        }
    });

    bot.on('chat', (username, message) => {
        if (config.utils['chat-log']) {
            logger.info(`<${username}> ${message}`);
        }
    });

    bot.on('goal_reached', () => {
        if (config.position.enabled) {
            logger.info(`${bot.username} arrived at target location: ${bot.entity.position}`);
        }
    });

    bot.on('death', () => {
        logger.warn(`${bot.username} has died and was respawned at ${bot.entity.position}`);
    });

    if (config.utils['auto-reconnect']) {
        bot.on('end', () => {
            setTimeout(() => {
                createBot(bot.username, bot.password, bot.auth); // Recreate bot on end
            }, config.utils['auto-reconnect-delay']);
        });
    }

    bot.on('kicked', (reason) => {
        let reasonText = reason && JSON.parse(reason).text ? JSON.parse(reason).text : 'Kicked for unknown reason';
        reasonText = reasonText.replace(/§./g, ''); // Remove formatting codes
        logger.warn(`${bot.username} was kicked from the server. Reason: ${reasonText}`);
    });

    bot.on('error', (err) => {
        logger.error(`${bot.username}: ${err.message}`);
    });
}

// Function to setup anti-AFK behavior
function setupAntiAFK(bot) {
    if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true);
    }

    if (config.utils['anti-afk'].jump) {
        bot.setControlState('jump', true);
    }

    if (config.utils['anti-afk']['hit'].enabled) {
        let delay = config.utils['anti-afk']['hit']['delay'];
        let attackMobs = config.utils['anti-afk']['hit']['attack-mobs'];

        setInterval(() => {
            if (attackMobs) {
                let entity = bot.nearestEntity(e => e.type !== 'object' && e.type !== 'player' && e.type !== 'global' && e.type !== 'orb' && e.type !== 'other');
                if (entity) {
                    bot.attack(entity);
                    return;
                }
            }
            bot.swingArm("right", true);
        }, delay);
    }

    if (config.utils['anti-afk'].rotate) {
        setInterval(() => {
            bot.look(bot.entity.yaw + 1, bot.entity.pitch, true);
        }, 100);
    }

    if (config.utils['anti-afk']['circle-walk'].enabled) {
        circleWalk(bot, config.utils['anti-afk']['circle-walk']['radius']);
    }
}

// Function to make the bot walk in a circle
function circleWalk(bot, radius) {
    const pos = bot.entity.position;
    let angle = 0;

    setInterval(() => {
        const x = pos.x + radius * Math.cos(angle);
        const z = pos.z + radius * Math.sin(angle);
        bot.pathfinder.setGoal(new GoalXZ(x, z));
        angle += Math.PI / 18; // Adjust the increment for speed
    }, 1000); // Adjust the interval as needed
}

// Function to create a bot with given credentials
function createBot(username, password, auth) {
    const bot = mineflayer.createBot({
        username: username,
        password: password,
        auth: auth,
        host: config.server.ip,
        port: config.server.port,
        version: config.server.version,
    });

    setupBot(bot);
}

// Function to create multiple bots
function createBots() {
    if (!Array.isArray(config.bots)) {
        logger.error("No bot configurations found.");
        return;
    }

    config.bots.forEach(botConfig => {
        if (botConfig.username && botConfig.password) {
            createBot(botConfig.username, botConfig.password, botConfig.type || 'offline');
        } else {
            logger.error("Bot configuration is missing username or password.");
        }
    });
}

// Start the bots
createBots();
