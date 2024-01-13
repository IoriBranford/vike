export { testRun }

import {
  page,
  run,
  partRegex,
  autoRetry,
  fetchHtml,
  getServerUrl,
  expectLog,
  editFile,
  editFileRevert,
  test,
  expect
} from '@brillout/test-e2e'
import assert from 'assert'

function testRun(
  cmd: 'npm run dev' | 'npm run prod' | 'npm run preview',
  {
    uiFramewok,
    lang
  }: {
    uiFramewok: 'react' | 'vue' | 'preact' | 'solid'
    lang?: 'ts'
    isSPA?: true
  }
) {
  const isProd = cmd === 'npm run prod' || cmd === 'npm run preview'
  const isDev = !isProd
  const testHMR = isDev && (uiFramewok === 'react' || uiFramewok === 'vue')

  run(cmd, { isFlaky: testHMR })

  test('page content is rendered to HTML', async () => {
    const html = await fetchHtml('/')
    // Solid injects attribute: <h1 data-hk="0-0-2-1-0">Welcome</h1>
    expect(html).toMatch(partRegex`<h1${/[^\>]*/}>Welcome</h1>`)
    // Vue injects: `<!--[-->Welcome<!--]-->`
    expect(html).toMatch(partRegex`<a ${/[^\>]+/}>${/.*/}Welcome${/.*/}</a>`)
    expect(html).toMatch(partRegex`<a ${/[^\>]+/}>${/.*/}About${/.*/}</a>`)
  })

  test('page is rendered to the DOM and interactive', async () => {
    await page.goto(getServerUrl() + '/')
    expect(await page.textContent('h1')).toBe('Welcome')
    expect(await page.textContent('button')).toBe('Counter 0')
    // autoRetry() because browser-side code may not be loaded yet
    await autoRetry(async () => {
      await page.click('button')
      if (uiFramewok === 'solid') {
        expect(await page.textContent('button')).not.toBe('Counter 0')
      } else {
        expect(await page.textContent('button')).toBe('Counter 1')
      }
    })
  })

  if (testHMR) {
    test('HMR', async () => {
      const file = (() => {
        if (uiFramewok === 'vue') {
          return './pages/index/+Page.vue'
        }
        if (uiFramewok === 'react') {
          if (lang === 'ts') {
            return './pages/index/+Page.tsx'
          } else {
            return './pages/index/+Page.jsx'
          }
        }
        assert(false)
      })()
      expect(await page.textContent('button')).toBe('Counter 1')
      expect(await page.textContent('h1')).toBe('Welcome')
      editFile(file, (s) => s.replace('Welcome', 'Welcome !'))
      await autoRetry(async () => {
        expect(await page.textContent('h1')).toBe('Welcome !')
      })
      expect(await page.textContent('button')).toBe('Counter 1')
      editFileRevert()
      await autoRetry(async () => {
        expect(await page.textContent('h1')).toBe('Welcome')
      })
      expect(await page.textContent('button')).toBe('Counter 1')
    })
  }

  test('about page', async () => {
    await page.click('a[href="/about"]')
    await autoRetry(async () => {
      const title = await page.textContent('h1')
      expect(title).toBe('About')
    })
  })

  test('active links', async () => {
    // Not sure why `autoRetry()` is needed here; isn't the CSS loading already awaited for in the previous `test()` call?
    await autoRetry(async () => {
      expect(await page.$eval('a[href="/about"]', (e) => getComputedStyle(e).backgroundColor)).toBe(
        'rgb(238, 238, 238)'
      )
      expect(await page.$eval('a[href="/"]', (e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    })
  })

  test('error page', async () => {
    await page.goto(getServerUrl() + '/does-not-exist')
    expect(await page.textContent('#page-content')).toBe('Page not found.')
    expectLog(
      'Failed to load resource: the server responded with a status of 404 (Not Found)',
      (log) => log.logSource === 'Browser Error' && partRegex`http://${/[^\/]+/}:3000/does-not-exist`.test(log.logText)
    )
  })
}
