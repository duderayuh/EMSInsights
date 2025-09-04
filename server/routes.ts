// ... content up to line 5913 unchanged ...

  // All route handlers are implemented above in the main registerRoutes function
}

async function initializeTelegramBot() {
  try {
    console.log('Initializing Telegram notification bot...');
    
    // Check if Telegram bot token is configured
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.log('Telegram bot token not configured - skipping initialization');
      console.log('Set TELEGRAM_BOT_TOKEN environment variable to enable notifications');
      return;
    }
    
    // Initialize the Telegram bot service
    const success = await telegramBotService.initialize();
    
    if (success) {
      console.log('✅ Telegram bot initialized successfully');
      
      // Start webhook server on port 3002 if webhook URL is configured
      if (process.env.TELEGRAM_WEBHOOK_URL) {
        const webhookPort = parseInt(process.env.TELEGRAM_WEBHOOK_PORT || '3002');
        console.log(`Telegram webhook server listening on port ${webhookPort}`);
      } else {
        console.log('Telegram bot using polling mode (no webhook URL configured)');
      }
      
      // Load initial keywords from database
      await keywordMonitor.refreshKeywords();
      console.log(`Loaded ${keywordMonitor.getActiveKeywordCount()} active notification keywords`);
      
    } else {
      console.error('❌ Failed to initialize Telegram bot - check configuration');
    }
  } catch (error) {
    console.error('Error initializing Telegram bot:', error);
  }
}

export { rdioScannerManager, audioProcessor, transcriptionService };