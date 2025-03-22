const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');

const inputFile = './static/css/tailwind.css';
const outputFile = './static/css/style.min.css';

// 确保输出目录存在
const outputDir = path.dirname(outputFile);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 读取输入文件
const css = fs.readFileSync(inputFile, 'utf8');

// 处理 CSS
postcss([
  tailwindcss,
  autoprefixer,
  cssnano({ preset: 'default' })
])
  .process(css, { from: inputFile, to: outputFile })
  .then(result => {
    fs.writeFileSync(outputFile, result.css);
    console.log('CSS 构建完成！');
  })
  .catch(error => {
    console.error('CSS 构建失败:', error);
    process.exit(1);
  }); 