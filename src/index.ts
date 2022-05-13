import { config } from 'dotenv'
import { initBrowser, initPage, resolveUnits } from './paddington'

// eslint-disable-next-line @typescript-eslint/no-floating-promises, max-statements
(async () => {
  config()

  const url = process.env.PADDINGTON_URL
  const referenceId = process.env.PADDINGTON_REFERENCE_ID
  const firstUnitId = process.env.PADDINGTON_FIRSTUNIT_ID
  const lastUnitId = process.env.PADDINGTON_LASTUNIT_ID
  const firstQuestionNumber = process.env.PADDINGTON_FIRSTQUESTION_NUMBER
  const lastQuestionNumber = process.env.PADDINGTON_LASTQUESTION_NUMBER
  const id = process.env.PADDINGTON_ID
  const password = process.env.PADDINGTON_PASSWORD
  const answersPath = process.env.PADDINGTON_ANSWERS_PATH
  const isEnabledHeadless = process.env.PADDINGTON_HEADLESS
  const sleepPerQuestion = process.env.PADDINGTON_SLEEP_PER_QUESTION
  const proxyServer = process.env.PADDINGTON_PROXY_SERVER

  if (
    answersPath &&
    url &&
    referenceId &&
    firstUnitId &&
    lastUnitId &&
    firstQuestionNumber &&
    lastQuestionNumber &&
    id &&
    password
  ) {
    const proxyServerUrl = proxyServer ? new URL(proxyServer) : undefined
    const browser = await initBrowser(
      answersPath,
      isEnabledHeadless?.toLowerCase() === 'true',
      proxyServerUrl
    )
    const page = await initPage(browser, url, id, password)
    await resolveUnits(
      page,
      Number.parseInt(referenceId, 10),
      Number.parseInt(firstUnitId, 10),
      Number.parseInt(lastUnitId, 10),
      answersPath,
      {
        firstQuestionNumber: Number.parseInt(firstQuestionNumber, 10),
        lastQuestionNumber: Number.parseInt(lastQuestionNumber, 10),
        // eslint-disable-next-line no-undefined
        sleepPerQuestion: sleepPerQuestion ? Number.parseInt(sleepPerQuestion, 10) : undefined,
        proxyServer: proxyServerUrl
      }
    )
    await page.close()
    await browser.close()
  }
})()
