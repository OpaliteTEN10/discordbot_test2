import { 
  Client, GatewayIntentBits, Events, Partials, Message, 
  REST, Routes, SlashCommandBuilder, ChatInputCommandInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, 
  ModalActionRowComponentBuilder, ChannelType, ThreadAutoArchiveDuration
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// ===== 配置区域 =====
const VERIFIED_ROLE_ID = '1419966562206748746';
const LOG_CHANNEL_ID = '1494155222241509476';
const THREAD_CHANNEL_ID = '1494158013446094898';
const ADMIN_USER_ID = '766273325827620865';
// ===================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel]
});

// ✅ 定义斜杠指令
const commands = [
  new SlashCommandBuilder()
    .setName('events')
    .setDescription('View hidden event locations')
    .addSubcommand(sub =>
      sub.setName('map').setDescription('Find the hidden map')
    )
    .addSubcommand(sub =>
      sub.setName('hub').setDescription('Find the hidden hub')
    ),

  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Start the verification process to claim extra rewards'),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create a custom embed message with a verify button (Admin Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option => 
      option.setName('title').setDescription('The title of the embed').setRequired(true))
    .addStringOption(option => 
      option.setName('description').setDescription('The main text of the embed').setRequired(true))
    .addStringOption(option => 
      option.setName('button_text').setDescription('The text displayed on the button').setRequired(true))
];

// ✅ Bot 上线时注册指令
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot is online! Logged in as ${c.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);
  try {
    await rest.put(
      Routes.applicationCommands(c.user.id),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log('✅ Slash commands registered!');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
});

// ✅ 创建 Modal 的复用函数
function createVerifyModal() {
  const modal = new ModalBuilder()
    .setCustomId('verify_modal')
    .setTitle('Player Verification');

  const gameInfoInput = new TextInputBuilder()
    .setCustomId('game_info')
    .setLabel('Please leave your game info')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const emailInfoInput = new TextInputBuilder()
    .setCustomId('email_info')
    .setLabel('Please leave your email info')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(gameInfoInput),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(emailInfoInput)
  );
  return modal;
}

// ✅ 处理所有交互
client.on(Events.InteractionCreate, async (interaction) => {

  // 1. 斜杠指令
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'events') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'map') {
        await interaction.reply({ content: 'dear user, congratulations you found out the hidden map', ephemeral: true });
      }
      if (sub === 'hub') {
        await interaction.reply({ content: 'dear user, congratulations you found out the hidden hub', ephemeral: true });
      }
    }

    if (interaction.commandName === 'verify') {
      await interaction.showModal(createVerifyModal());
    }

    if (interaction.commandName === 'embed') {
      const title = interaction.options.getString('title')!;
      const description = interaction.options.getString('description')!;
      const buttonText = interaction.options.getString('button_text')!;

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0x0099FF);

      const verifyButton = new ButtonBuilder()
        .setCustomId('trigger_verify_modal')
        .setLabel(buttonText)
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton);
      await interaction.reply({ embeds: [embed], components: [row] });
    }
  }

  // 2. 按钮点击
  if (interaction.isButton()) {
    if (interaction.customId === 'trigger_verify_modal') {
      await interaction.showModal(createVerifyModal());
    }
  }

  // 3. Modal 提交
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'verify_modal') {
      const gameInfo = interaction.fields.getTextInputValue('game_info');
      const emailInfo = interaction.fields.getTextInputValue('email_info');
      const user = interaction.user;
      const guild = interaction.guild;

      // 立即回复用户，防止 interaction 超时
      await interaction.reply({
        content: 'your verify is completed, but wait... gm will contact you soon',
        ephemeral: true
      });

      // ===== 需求1：给玩家分配 Role =====
      try {
        const member = await guild?.members.fetch(user.id);
        const role = guild?.roles.cache.get(VERIFIED_ROLE_ID);
        if (member && role) {
          await member.roles.add(role);
          console.log(`✅ Role assigned to ${user.tag}`);
        } else {
          console.warn('⚠️ Member or Role not found');
        }
      } catch (error) {
        console.error('❌ Error assigning role:', error);
      }

      // ===== 需求2：推送记录到 Log 频道 =====
      try {
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (logChannel?.isTextBased() && !logChannel.isDMBased()) {
          const logEmbed = new EmbedBuilder()
            .setTitle('📋 New Verification Submission')
            .setColor(0x00C851)
            .addFields(
              { name: 'Discord User', value: `<@${user.id}>`, inline: true },
              { name: 'Discord ID', value: user.id, inline: true },
              { name: 'Game Info', value: gameInfo },
              { name: 'Email Info', value: emailInfo },
              { name: 'Submitted At', value: new Date().toISOString(), inline: true }
            );
          // @ts-ignore
          await logChannel.send({ embeds: [logEmbed] });
          console.log(`✅ Log sent to channel ${LOG_CHANNEL_ID}`);
        }
      } catch (error) {
        console.error('❌ Error sending log:', error);
      }

      // ===== 需求3：在指定频道创建 Private Thread =====
      try {
        const threadChannel = await client.channels.fetch(THREAD_CHANNEL_ID);
        if (threadChannel?.isTextBased() && !threadChannel.isDMBased() && 'threads' in threadChannel) {
          // 用玩家填写的第一个问题答案作为 Thread 名称（最多100字符）
          const threadName = gameInfo.slice(0, 100);

          // 创建 Private Thread
          const thread = await (threadChannel as any).threads.create({
            name: threadName,
            type: ChannelType.PrivateThread,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            invitable: false, // 取消 anyone can invite，只有 admin 能邀请
          });

          // 把玩家和 admin 加入 Thread
          await thread.members.add(user.id);
          await thread.members.add(ADMIN_USER_ID);

          // 在 Thread 内发送通知消息
          await thread.send(`<@${user.id}> wait no longer... gm will contact you soon`);

          console.log(`✅ Private thread "${threadName}" created for ${user.tag}`);
        }
      } catch (error) {
        console.error('❌ Error creating thread:', error);
      }

      // ===== 原有需求：推送到 n8n =====
      try {
        const N8N_FORM_WEBHOOK_URL = process.env.N8N_FORM_WEBHOOK_URL;
        if (N8N_FORM_WEBHOOK_URL) {
          const body = {
            type: 'verify_submission',
            userId: user.id,
            userTag: user.tag,
            gameInfo: gameInfo,
            emailInfo: emailInfo,
            timestamp: new Date().toISOString()
          };
          await fetch(N8N_FORM_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
        } else {
          console.warn('⚠️ N8N_FORM_WEBHOOK_URL is not set.');
        }
      } catch (error) {
        console.error('❌ Error sending to n8n:', error);
      }
    }
  }
});

// ✅ 保留原来的私信和@提及功能
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  if (message.channel.isDMBased()) {
    console.log(`📩 Received DM from ${message.author.tag}: ${message.content}`);
    try {
      const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
      if (N8N_WEBHOOK_URL) {
        const body = {
          type: 'direct_message',
          userId: message.author.id,
          message: message.content
        };
        await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }
    } catch (error) {
      console.error('❌ Error handling DM:', error);
    }

  } else if (message.mentions.has(client.user!.id)) {
    console.log(`💬 Mentioned by ${message.author.tag}: ${message.content}`);
    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
    if (N8N_WEBHOOK_URL) {
      const body = {
        type: 'channel_mention',
        userId: message.author.id,
        message: message.content,
        channelId: message.channel.id,
      };
      await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }
  }
});

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('❌ Error: DISCORD_BOT_TOKEN is not defined');
  process.exit(1);
}

client.login(token);
