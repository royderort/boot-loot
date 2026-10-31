if (content.startsWith('!importar ')) {
    const partyName = content.slice(10).trim();
    if (!partyName) {
        return message.reply('Debes indicar el nombre de la party. Ejemplo: `!importar NE_ANKOU_FIESTA` respondiendo al mensaje.');
    }

    if (!message.reference) {
        return message.reply('Debes **responder (reply)** al mensaje que contiene la lista de usuarios para poder importarlos.');
    }

    try {
        const targetMessage = await message.channel.messages.fetch(message.reference.messageId);
        const party = getParty(guildId, partyName);

        const addedUsers = [];
        const alreadyInParty = [];

        for (const user of targetMessage.mentions.users.values()) {
            if (user.bot) continue; // ignora bots
            const username = user.username;
            if (party.members.has(username)) {
                alreadyInParty.push(username);
            } else {
                party.members.add(username);
                addedUsers.push(username);
            }
        }

        if (addedUsers.length === 0 && alreadyInParty.length === 0) {
            return message.reply('No se encontraron menciones de usuarios en el mensaje citado.');
        }

        let response = `📥 **Importación a ${partyName}**\n`;
        if (addedUsers.length > 0) response += `➕ Añadidos: ${addedUsers.join(', ')}\n`;
        if (alreadyInParty.length > 0) response += `⚠️ Ya estaban: ${alreadyInParty.join(', ')}\n`;
        response += `Integrantes totales (${party.members.size}): ${Array.from(party.members).join(', ')}`;
        return message.reply(response);

    } catch (error) {
        console.error(error);
        return message.reply('Hubo un error al intentar leer el mensaje citado.');
    }
}
