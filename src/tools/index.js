const { registerOrganizationTools } = require('./organization');
const { registerBoardsTools } = require('./boards');
const { registerCardsTools } = require('./cards');
const { registerCommentsTools } = require('./comments');
const { registerChecklistsTools } = require('./checklists');
const { registerTasksTools } = require('./tasks');

const registerAllTools = server => {
    registerOrganizationTools(server);
    registerBoardsTools(server);
    registerCardsTools(server);
    registerCommentsTools(server);
    registerChecklistsTools(server);
    registerTasksTools(server);
};

module.exports = { registerAllTools };
