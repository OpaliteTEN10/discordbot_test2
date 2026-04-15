import { 
  Client, GatewayIntentBits, Events, Partials, Message, 
  REST, Routes, SlashCommandBuilder, ChatInputCommandInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ModalActionRowComponentBuilder
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

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
  // 原有 events 指令
  new SlashCommandBuilder()
    .setName('events')
    .setDescription('View hidden event locations')
    .addSubcommand(sub =>
      sub.setName('map')
         .setDescription('Find the hidden map')
    )
    .addSubcommand(sub =>
      sub.setName('hub')
         .setDescription('Find the hidden hub')
    ),

  // 新增 verify 指令 (直接触发 Modal)
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Start the verification process to claim extra rewards'),

  // 新增 embed 指令 (仅管理员可用，支持自定义参数)
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create a custom embed message with a verify button (Admin Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // 仅限管理员
    .addStringOption(option => 
      option.setName('title')
            .setDescription('The title of the embed')
            .setRequired(true))
    .addStringOption(option => 
      option.setName('description')
            .setDescription('The main text of the embed')
            .setRequired(true))
    .addStringOption(option => 
      option.setName('button_text')
            .setDescription('The text displayed on the button')
            .setRequired(true))
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

// ✅ 创建弹出表单(Modal)的复用函数
function createVerifyModal() {
  const modal = new ModalBuilder()
    .setCustomId('verify_modal')
    .setTitle('Player Verification');

  const gameInfoInput = new TextInputBuilder()
    .setCustomId('game_info')
    .setLabel('Please leave your game info')
    .setStyle(TextInputStyle.Short) // 简短输入，若需长文本可改为 Paragraph
    .setRequired(true);

  const emailInfoInput = new TextInputBuilder()
    .setCustomId('email_info')
    .setLabel('Please leave your email info')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  // Modal 中的每个输入框都需要包裹在一个 ActionRow 里
  const firstActionRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(gameInfoInput);
  const secondActionRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(emailInfoInput);

  modal.addComponents(firstActionRow, secondActionRow);
  return modal;
}

// ✅ 处理所有的交互 (指令、按钮、表单提交)
client.on(Events.InteractionCreate, async (interaction) => {
  
  // 1. 处理斜杠指令
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
      // 触发 /verify，直接弹出表单
      await interaction.showModal(createVerifyModal());
    }

    if (interaction.commandName === 'embed') {
      // 获取管理员输入的参数
      const title = interaction.options.getString('title')!;
      const description = interaction.options.getString('description')!;
      const buttonText = interaction.options.getString('button_text')!;

      // 构建 Embed
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0x0099FF); // 你可以自行修改颜色十六进制

      // 构建按钮
      const verifyButton = new ButtonBuilder()
        .setCustomId('trigger_verify_modal') // 按钮的唯一ID
        .setLabel(buttonText)
        .setStyle(ButtonStyle.Primary); // 蓝色主按钮

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton);

      // 发送公开的 Embed 信息到当前频道
      await interaction.reply({ embeds: [embed], components: [row] });
    }
  }

  // 2. 处理按钮点击
  if (interaction.isButton()) {
    if (interaction.customId === 'trigger_verify_modal') {
      // 用户点击了 Embed 下方的按钮，弹出验证表单
      await interaction.showModal(createVerifyModal());
    }
  }

  // 3. 处理表单(Modal)提交
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'verify_modal') {
      const gameInfo = interaction.fields.getTextInputValue('game_info');
      const emailInfo = interaction.fields.getTextInputValue('email_info');

      // 立即以 Ephemeral 形式回复用户
      await interaction.reply({
        content: 'your verify is completed, but wait... gm will contact you later with extra rewards',
        ephemeral: true
      });

      // 将收集到的数据推送到 n8n 处理 (更新谷歌表格)
      try {
        const N8N_FORM_WEBHOOK_URL = process.env.N8N_FORM_WEBHOOK_URL;
        if (N8N_FORM_WEBHOOK_URL) {
          const body = {
            type: 'verify_submission',
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            gameInfo: gameInfo,
            emailInfo: emailInfo,
            timestamp: new Date().toISOString()
          };
          await fetch(N8N_FORM_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          console.log(`✅ User ${interaction.user.tag} submitted verification.`);
        } else {
          console.warn('⚠️ N8N_FORM_WEBHOOK_URL is not set in environment variables.');
        }
      } catch (error) {
        console.error('❌ Error sending form data to n8n:', error);
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
