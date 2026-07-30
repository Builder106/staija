const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Emulate iPhone X / Mobile Viewport
  await page.setViewport({
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    isLandscape: false,
  });

  await page.goto('https://staija.org', { waitUntil: 'networkidle2' });
  
  // Take screenshot and save it directly to the public folder
  await page.screenshot({ path: '../public/staija_mobile.png' });
  
  await browser.close();
  console.log("Screenshot saved to public/staija_mobile.png");
})();
