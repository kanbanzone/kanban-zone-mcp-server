const { registerOrganizationTools } = require('./organization');
const { registerBoardsTools } = require('./boards');
const { registerCardsTools } = require('./cards');
const { registerCommentsTools } = require('./comments');
const { registerChecklistsTools } = require('./checklists');
const { registerTasksTools } = require('./tasks');
const { registerLabelsTools } = require('./labels');

const registerAllTools = server => {
    registerOrganizationTools(server);
    registerBoardsTools(server);
    registerCardsTools(server);
    registerCommentsTools(server);
    registerChecklistsTools(server);
    registerTasksTools(server);
    registerLabelsTools(server);
};

module.exports = { registerAllTools };
