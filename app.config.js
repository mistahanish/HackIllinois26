require('dotenv').config();

const appJson = require('./app.json');

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
      geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
    },
  },
};
