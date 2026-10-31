require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

// --- Servidor web temporal para Render ---
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('¡El bot de loot de Discord está activo y funcionando!');
});

app.listen(PORT, () => {
    console.log(`Servidor web escuchando en el puerto ${PORT}`);
});
// ----------------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Estructura: guildId => Map(partyName => { members: Set(), drops: [] })
const serverParties = new Map();

function getParty(guildId, partyName) {
    if (!serverParties.has(guildId)) {
        serverParties.set(guildId, new Map());
    }
    const parties = serverParties.get(guildId);
    if (!parties.has(partyName)) {
        parties.set(partyName, { members: new Set(), drops: [] });
    }
    return parties.get(partyName);
}

client.once('clientReady', () => {
    console.log(`¡Bot encendido como ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content;
    const guildId = message.guild.id;

    // 1. Unirse uno mismo: !unirse [nombre_party]
    if (content.startsWith('!unirse ')) {
        const partyName = content.slice(8).trim();
        if (!partyName) return message.reply('Debes indicar el nombre de la party. Ejemplo: `!unirse RaidBoss`');

        const party = getParty(guildId, partyName);
        party.members.add(message.author.username);
        return message.reply(`¡Te has unido a la party **${partyName}**! Integrantes actuales (${party.members.size}): ${Array.from(party.members).join(', ')}`);
    }

    // 2. Agregar a otro usuario: !agregar [nombre_party] [nombre_usuario]
    if (content.startsWith('!agregar ')) {
        const args = content.slice(9).trim().split(' ');
        if (args.length < 2) {
            return message.reply('Formato incorrecto. Usa: `!agregar [nombre_party] [nombre_usuario]`');
        }

        const partyName = args.shift();
        const targetUser = args.join(' ');

        const party = getParty(guildId, partyName);
        if (party.members.has(targetUser)) {
            return message.reply(`El usuario **${targetUser}** ya se encuentra registrado en la party **${partyName}**.`);
        }

        party.members.add(targetUser);
        return message.reply(`➕ El usuario **${targetUser}** ha sido agregado a la party **${partyName}**. Integrantes actuales (${party.members.size}): ${Array.from(party.members).join(', ')}`);
    }

    // 3. Salirse uno mismo: !salir [nombre_party]
    if (content.startsWith('!salir ')) {
        const partyName = content.slice(7).trim();
        if (!partyName) return message.reply('Debes indicar el nombre de la party de la que deseas salir. Ejemplo: `!salir RaidBoss`');

        const parties = serverParties.get(guildId);
        if (!parties || !parties.has(partyName)) {
            return message.reply(`La party **${partyName}** no existe.`);
        }

        const party = parties.get(partyName);
        if (!party.members.has(message.author.username)) {
            return message.reply(`No estás registrado en la party **${partyName}**.`);
        }

        party.members.delete(message.author.username);
        return message.reply(`Has salido de la party **${partyName}**. Integrantes restantes (${party.members.size}): ${party.members.size > 0 ? Array.from(party.members).join(', ') : 'Ninguno'}`);
    }

    // 4. Expulsar a otro usuario: !expulsar [nombre_party] [nombre_usuario]
    if (content.startsWith('!expulsar ')) {
        const args = content.slice(10).trim().split(' ');
        if (args.length < 2) {
            return message.reply('Formato incorrecto. Usa: `!expulsar [nombre_party] [nombre_usuario]`');
        }

        const partyName = args.shift();
        const targetUser = args.join(' ');

        const parties = serverParties.get(guildId);
        if (!parties || !parties.has(partyName)) {
            return message.reply(`La party **${partyName}** no existe.`);
        }

        const party = parties.get(partyName);
        if (!party.members.has(targetUser)) {
            return message.reply(`El usuario **${targetUser}** no se encuentra en la party **${partyName}**.`);
        }

        party.members.delete(targetUser);
        return message.reply(`👢 El usuario **${targetUser}** ha sido expulsado de la party **${partyName}**. Integrantes restantes (${party.members.size}): ${party.members.size > 0 ? Array.from(party.members).join(', ') : 'Ninguno'}`);
    }

    // 5. Ver miembros de una party: !miembros [nombre_party]
    if (content.startsWith('!miembros ')) {
        const partyName = content.slice(10).trim();
        if (!partyName) return message.reply('Debes indicar el nombre de la party. Ejemplo: `!miembros RaidBoss`');

        const parties = serverParties.get(guildId);
        if (!parties || !parties.has(partyName)) {
            return message.reply(`La party **${partyName}** no existe.`);
        }

        const party = parties.get(partyName);
        if (party.members.size === 0) {
            return message.reply(`No hay miembros en la party **${partyName}** actualmente.`);
        }

        return message.reply(`👥 **Integrantes de ${partyName} (${party.members.size}):** ${Array.from(party.members).join(', ')}`);
    }

    // 6. Registrar un drop: !drop [nombre_party] [nombre_item] [valor]
    if (content.startsWith('!drop ')) {
        const args = content.slice(6).trim().split(' ');
        if (args.length < 3) {
            return message.reply('Formato incorrecto. Usa: `!drop [nombre_party] [nombre_item] [valor]`');
        }

        const partyName = args.shift();
        const value = parseInt(args.pop());
        const itemName = args.join(' ');

        if (isNaN(value)) {
            return message.reply('El valor del ítem debe ser un número válido.');
        }

        const party = getParty(guildId, partyName);
        party.drops.push({ item: itemName, value: value, collector: message.author.username });

        return message.reply(`📦 Drop registrado en **${partyName}**: **${itemName}** por **${value.toLocaleString()}** (Obtenido por ${message.author.username})`);
    }

    // 7. Calcular cuentas de una party: !repartir [nombre_party]
    if (content.startsWith('!repartir ')) {
        const partyName = content.slice(10).trim();
        if (!partyName) return message.reply('Debes indicar el nombre de la party a repartir. Ejemplo: `!repartir RaidBoss`');

        const parties = serverParties.get(guildId);
        if (!parties || !parties.has(partyName)) {
            return message.reply(`La party **${partyName}** no existe o no tiene datos registrados.`);
        }

        const party = parties.get(partyName);
        if (party.members.size === 0) {
            return message.reply(`No hay miembros registrados en la party **${partyName}**.`);
        }
        if (party.drops.length === 0) {
            return message.reply(`No hay drops registrados en la party **${partyName}**.`);
        }

        let totalValue = party.drops.reduce((sum, drop) => sum + drop.value, 0);
        let memberCount = party.members.size;
        let sharePerPerson = Math.floor(totalValue / memberCount);

        let report = `💰 **Reporte de Loot: ${partyName}** 💰\n`;
        report += `• **Valor Total:** ${totalValue.toLocaleString()}\n`;
        report += `• **Integrantes (${memberCount}):** ${Array.from(party.members).join(', ')}\n`;
        report += `• **A cada uno le corresponde:** **${sharePerPerson.toLocaleString()}**\n\n`;
        report += `_Detalle de Drops_:\n`;
        party.drops.forEach(d => {
            report += `- ${d.item}: ${d.value.toLocaleString()} (${d.collector})\n`;
        });

        return message.channel.send(report);
    }

    // 8. Listar partys activas: !listpartys
    if (content === '!listpartys') {
        const parties = serverParties.get(guildId);
        if (!parties || parties.size === 0) {
            return message.reply('No hay partys activas en este servidor.');
        }

        let listMsg = `📋 **Partys Activas en el Servidor** 📋\n`;
        parties.forEach((data, name) => {
            listMsg += `- **${name}**: ${data.members.size} miembros, ${data.drops.length} drops\n`;
        });

        return message.reply(listMsg);
    }

    // 9. Borrar una party específica: !resetparty [nombre_party]
    if (content.startsWith('!resetparty ')) {
        const partyName = content.slice(12).trim();
        const parties = serverParties.get(guildId);
        
        if (parties && parties.has(partyName)) {
            parties.delete(partyName);
            return message.reply(`🔄 La party **${partyName}** ha sido eliminada y reiniciada.`);
        } else {
            return message.reply(`La party **${partyName}** no fue encontrada.`);
        }
    }
});

client.login(process.env.TOKEN);
