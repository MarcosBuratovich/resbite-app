import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const root=new URL('../../supabase/templates/',import.meta.url);
const output='/private/tmp/resbite-email-previews';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.RESBITE_QA_BROWSER||'chrome',headless:true});
try {
 for(const name of ['confirmation','recovery','email-code']) {
  const html=await readFile(new URL(`${name}.html`,root),'utf8');
  const variables=[...html.matchAll(/{{\s*\.([A-Za-z]+)\s*}}/g)].map(x=>x[1]);
  assert.deepEqual([...new Set(variables)],[name==='email-code'?'Token':'ConfirmationURL']);
  assert.ok(!/<script|<iframe|<form|<img|@import/i.test(html));
  const fixture=html.replaceAll('{{ .ConfirmationURL }}','https://example.invalid/auth/verify?token='+ 'x'.repeat(128)+'&redirect_to=resbite%3A%2F%2Fauth%2Fcallback').replaceAll('{{ .Token }}','12345678');
  for(const width of [320,600]) {
   const page=await browser.newPage({viewport:{width,height:1100}});
   await page.route('**/*',route=>route.abort());
   await page.setContent(fixture);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} overflow at ${width}`);
   assert.equal(await page.locator('h1').count(),1);
   const links=await page.locator('a').evaluateAll(elements=>elements.map(x=>x.getAttribute('href')));
   assert.equal(links.length,name==='email-code'?0:2);
   assert.ok(links.every(x=>x.startsWith('https://example.invalid/auth/verify?')));
   await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true});
   await page.close();
  }
 }
 console.log('Three email templates passed token, link and 320/600px layout checks. No network requests or emails sent.');
} finally {await browser.close();}
