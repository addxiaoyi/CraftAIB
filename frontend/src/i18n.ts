export type AppLanguage = 'zh' | 'en';

export const messages = {
  en: {
    nav: { ai_builder: 'AI Architect', viewer_3d: '3D Viewer', projections: 'Projections', materials: 'Materials', pixel_art: 'Pixel Art', map_art: 'Map Art', voxel_lab: 'Voxel Lab', geo_scene: 'Geo Scene', lego_ldraw: 'LEGO / LDraw', settings: 'Settings' },
    project: { save: 'Save', open: 'Open', restored: 'Project restored', invalid: 'Invalid CraftAIB project file.' },
    pages: { mapArt: 'Map Art Workbench', voxel: 'Voxel Lab', geo: 'Geo Scene', lego: 'LEGO / LDraw', materials: 'Materials', settings: 'Settings', projections: 'Projection Files', pixelArt: 'Pixel Art' },
  },
  zh: {
    nav: { ai_builder: 'AI 建筑', viewer_3d: '3D 查看器', projections: '投影文件', materials: '材料清单', pixel_art: '图片像素画', map_art: '地图画', voxel_lab: '体素实验室', geo_scene: '地理场景', lego_ldraw: 'LEGO / LDraw', settings: '设置' },
    project: { save: '保存', open: '打开', restored: '项目已恢复', invalid: '项目文件格式无效。' },
    pages: { mapArt: '地图画工作台', voxel: '体素实验室', geo: '地理场景', lego: 'LEGO / LDraw', materials: '材料清单', settings: '设置', projections: '投影文件', pixelArt: '图片像素画' },
  },
} as const;

export function tr(language: AppLanguage) { return messages[language]; }
