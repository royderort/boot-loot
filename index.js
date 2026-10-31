require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

// --- Servidor web para Render ---
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

    // 2. Agregar uno o varios usuarios: !agregar [nombre_party] [usuario1] [usuario2] ...
    if (content.startsWith('!agregar ')) {
        const args = content.slice(9).trim().split(/\s+/);
        if (args.length < 2) {
            return message.reply('Formato incorrecto. Usa: `!agregar [nombre_party] [usuario1] [usuario2] ...`');
        }

        const partyName = args.shift();
        const party = getParty(guildId, partyName);

        const addedUsers = [];
        const alreadyInParty = [];

        for (const user of args) {
            if (party.members.has(user)) {
                alreadyInParty.push(user);
            } else {
                party.members.add(user);
                addedUsers.push(user);
            }
        }

        let response = '';
        if (addedUsers.length > 0) {
            response += `➕ Agregado(s) a **${partyName}**: **${addedUsers.join(', ')}**.\n`;
        }
        if (alreadyInParty.length > 0) {
            response += `⚠️ Ya estaban en la party: **${alreadyInParty.join(', ')}**.\n`;
        }

        response += `Integrantes actuales (${party.members.size}): ${Array.from(party.members).join(', ')}`;
        return message.reply(response);
    }

    // 2.1 NUEVO: Importar usuarios desde un mensaje citado/respondido
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
            const textToParse = targetMessage.content;
            const party = getParty(guildId, partyName);

            const addedUsers = [];

            // Extrae menciones de usuarios de Discord directas (<@ID> o <@!ID>)
            const userMentions = targetMessage.mentions.users.values();
            for (const user of userMentions) {
                const username = user.username;
                if (!party.members.has(username)) {
                    party.members.add(username);
                    addedUsers.push(username);
                }
            }

            // Analiza líneas con barras (ej: @Tioarturo/Tiapola/Tioficha) por si hay nombres escritos a mano
            const lines = textToParse.split('\n');
            for (const line of lines) {
                if (line.includes('/')) {
                    // Extrae la parte posterior a los dos puntos o limpia las arrobas
                    const cleanLine = line.replace(/<@\d+>/g, ''); // Remueve menciones técnicas si las hubiera
                    const parts = cleanLine.split(':');
                    if (parts.length > 1) {
                        const namesPart = parts[1].trim();
                        const subNames = namesPart.split('/');
                        for (let name of subNames) {
                            name = name.replace('@', '').trim();
                            if (name && !party.members.has(name)) {
                                party.members.add(name);
                                addedUsers.push(name);
                            }
                        }
                    }
                }
            }

            if (addedUsers.length === 0) {
                return message.reply('No se pudieron detectar nuevos usuarios válidos en el mensaje citado.');
            }

            return message.reply(`📥 **¡Importación exitosa a ${partyName}!**\nSe añadieron: ${addedUsers.join(', ')}\nIntegrantes totales (${party.members.size}): ${Array.from(party.members).join(', ')}`);

        } catch (error) {
            console.error(error);
            return message.reply('Hubo un error al intentar leer el mensaje citado.');
        }
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
        const args = content.slice(10).trim().split(/\s+/);
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

    // 6. Registrar drops (1 o varios): !drop [party] [cantidad x] [item] [valor_unitario]
    if (content.startsWith('!drop ')) {
        const args = content.slice(6).trim().split(/\s+/);
        if (args.length < 3) {
            return message.reply('Formato incorrecto. Usa: `!drop [nombre_party] [nombre_item] [valor]` o `!drop [nombre_party] 3x [nombre_item] [valor_unitario]`');
        }

        const partyName = args.shift();
        const value = parseInt(args.pop());

        if (isNaN(value)) {
            return message.reply('El valor del ítem debe ser un número válido.');
        }

        let amount = 1;
        if (/^\d+[xX]$/.test(args[0])) {
            amount = parseInt(args.shift());
        }

        const itemName = args.join(' ');
        if (!itemName) {
            return message.reply('Debes indicar el nombre del ítem.');
        }

        const party = getParty(guildId, partyName);
        
        for (let i = 0; i < amount; i++) {
            party.drops.push({ item: itemName, value: value, collector: message.author.username });
        }

        const totalValue = value * amount;
        if (amount > 1) {
            return message.reply(`📦 Registrados **${amount}x ${itemName}** en **${partyName}** por **${value.toLocaleString()}** c/u (Total: **${totalValue.toLocaleString()}**) de ${message.author.username}`);
        } else {
            return message.reply(`📦 Drop registrado en **${partyName}**: **${itemName}** por **${value.toLocaleString()}** (Obtenido por ${message.author.username})`);
        }
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

client.login(process.env.TOKEN);
