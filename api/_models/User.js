import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  mobile: {
    type: String,
  },
  state: {
    type: String,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    default: 'FARMER',
  },
  organizationType: {
    type: String,
    enum: ['retailer', 'wholesaler', 'processor', 'other'],
    default: null,
  },
  marketContactConsent: { type: Boolean, default: false },
  preferredLanguage: {
    type: String,
    default: 'en',
  },
  notifications: {
    telegram: {
      enabled: { type: Boolean, default: false },
      chatId: { type: String, default: null },
      connectedAt: { type: Date, default: null },
    },
    whatsapp: {
      enabled: { type: Boolean, default: false },
      phone: { type: String, default: null },
    },
    inApp: {
      enabled: { type: Boolean, default: true },
    },
  },
  telegramLinkToken: { type: String, select: false },
  telegramLinkExpiresAt: { type: Date, select: false },
  marketAlerts: {
    enabled: { type: Boolean, default: false },
    cropId: String,
    state: String,
    stateId: Number,
    priceEnabled: { type: Boolean, default: true },
    demandEnabled: { type: Boolean, default: true },
    priceAbove: { type: Number, default: null },
    priceBelow: { type: Number, default: null },
    lastDemandCheckAt: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

UserSchema.index({ 'notifications.telegram.chatId': 1 }, { unique: true, partialFilterExpression: { 'notifications.telegram.chatId': { $type: 'string' } } });

export default mongoose.models.User || mongoose.model('User', UserSchema);
