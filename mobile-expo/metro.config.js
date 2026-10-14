// Metro: cho phép import bảng phân loại rác dùng chung từ ../frontend (một nguồn duy nhất cho web + app).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../frontend/src/js/config')];

module.exports = config;
