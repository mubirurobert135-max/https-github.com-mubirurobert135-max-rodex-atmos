import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const publicDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });
const svgPath = path.join(publicDir, 'icon.svg');
const approvedEmblemPath = path.join(publicDir, 'rodex-emblem.png');

async function generateIcons() {
  // The approved artwork is imported once into public/rodex-emblem.png.
  // Bundle it into the favicon SVG so the logo remains available offline.
  if (fs.existsSync(approvedEmblemPath)) {
    // Keep the approved sun/cloud artwork while making every generated icon neutral.
    const image = (await sharp(approvedEmblemPath).greyscale().png().toBuffer()).toString('base64');
    const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="RODEX Atmos sun and cloud">
      <defs><clipPath id="art"><rect x="48" y="48" width="416" height="416" rx="76"/></clipPath></defs>
      <rect width="512" height="512" rx="112" fill="#101010"/>
      <image x="48" y="48" width="416" height="416" preserveAspectRatio="xMidYMid meet" clip-path="url(#art)" href="data:image/png;base64,${image}"/>
      <rect x="48" y="48" width="416" height="416" rx="76" fill="none" stroke="#bcbcbc" stroke-width="3"/>
    </svg>`;
    fs.writeFileSync(svgPath, iconSvg);
  }
  const source = fs.readFileSync(svgPath);
  console.log('Generating platform icons for the RODEX Atmos brand...');
  await Promise.all([
    sharp(source).resize(192,192).png().toFile(path.join(publicDir,'pwa-192x192.png')),
    sharp(source).resize(512,512).png().toFile(path.join(publicDir,'pwa-512x512.png')),
    sharp(source).resize(180,180).png().toFile(path.join(publicDir,'apple-touch-icon.png')),
    sharp(source).resize(410,410).extend({
      top:51,bottom:51,left:51,right:51,
      background:{r:16,g:16,b:16,alpha:1}
    }).png().toFile(path.join(publicDir,'pwa-maskable-512x512.png'))
  ]);
  console.log('RODEX Atmos favicon, iOS, Android and maskable app icons are ready.');
}
generateIcons().catch(err=>{console.error('Icon generation failed:',err);process.exitCode=1;});
