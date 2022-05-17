/* eslint-disable no-await-in-loop, max-statements, unicorn/no-await-expression-member */

import { setTimeout } from 'node:timers/promises'
import { existsSync, readFileSync, writeFileSync, writeJSONSync } from 'fs-extra'
import translate from 'google-translate-open-api'
import { getLogger, Logger } from 'log4js'
import type { Browser, ElementHandle, Page } from 'puppeteer'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { findBestMatch } from 'string-similarity'

puppeteer.use(StealthPlugin())

const logger: Logger = getLogger()
logger.level = 'all'

const initBrowser = async (
  answersPath: string,
  isEnabledHeadless?: boolean,
  proxyServer?: URL
): Promise<Browser> => {
  if (!existsSync(answersPath)) {
    try {
      JSON.parse(readFileSync(answersPath).toString())
    } catch {
      writeFileSync(answersPath, '{}')
    }
  }
  const defaultArguments = ['--lang=ja']
  proxyServer && defaultArguments.push(`--proxy-server=${proxyServer.host}`)
  const browser = await puppeteer.launch({ args: defaultArguments, headless: isEnabledHeadless })
  logger.info('instance has been initialized')

  return browser
}

const initPage = async (
  browser: Browser,
  url: string,
  id: string,
  password: string
// eslint-disable-next-line max-params
): Promise<Page> => {
  const [page] = await browser.pages()
  await page.goto(url, { waitUntil: 'load' })
  await page.type('input[name="id"]', id)
  await page.type('input[name="password"]', password)
  await Promise.all([
    page.waitForNavigation(),
    page.click('input#btn-login')
  ])
  logger.info('page has been initialized')

  return page
}

type MenuItem = 'Top' | 'Study' | 'QandA' | 'UserInfo'

const navigateMenuItem = async (page: Page, itemName: MenuItem): Promise<Page> => {
  await page.evaluate(`document.${itemName}.submit()`)
  await page.waitForNavigation()
  logger.info(`navigated to ${itemName}`)

  return page
}

const selectReference = async (page: Page, referenceId: number): Promise<Page> => {
  await page.evaluate(`select_reference('${referenceId}')`)
  await page.waitForNavigation()
  logger.info(`selected reference: ${referenceId}`)

  return page
}

const calcUnitId = (firstUnitId: number, lastQuestionNumber: number) => firstUnitId + (lastQuestionNumber / 25 * 4) - 4

const selectUnit = async (page: Page, currentUnitId: number): Promise<Page> => {
  await page.evaluate(`select_unit('drill', '${currentUnitId}', '')`)
  await page.waitForNavigation()
  logger.info(`selected unit: ${currentUnitId}`)
  return page
}

// eslint-disable-next-line max-lines-per-function
const resolveUnit = async (
  page: Page,
  answersPath: string,
  sleepPerQuestion?: number,
  proxyServer?: URL
// eslint-disable-next-line max-params, sonarjs/cognitive-complexity
): Promise<Page> => {
  let unitProgress = 0

  while (true) {
    sleepPerQuestion && await setTimeout(sleepPerQuestion)

    const questionElement = await page.$('div#qu02')
    // eslint-disable-next-line max-len
    const questionValue = questionElement && await (await questionElement.getProperty('textContent')).jsonValue<string>()

    if (!questionElement || !questionValue) return page

    const choices: Array<ElementHandle> = await page.$$('input[name="answer[0]"]')
    // eslint-disable-next-line max-len, @typescript-eslint/no-misused-promises
    const values = await Promise.all(choices.map(async (choice) => (await choice.getProperty('value')).jsonValue<string>() || ''))
    const answers = JSON.parse(readFileSync(answersPath).toString()) as unknown as Record<string, string>
    const answerKeys: string[] = Object.keys(answers)
    const answerValues: string[] = Object.values(answers)
    let answerIndex = 0

    if (answerKeys.includes(questionValue)) {
      answerIndex = values.indexOf(answerValues[answerKeys.indexOf(questionValue)])
    } else {
      const result = await translate(
        values,
        {
          client: 'dict-chrome-ex',
          from: 'ja',
          // eslint-disable-next-line no-undefined
          proxy: proxyServer ? { host: proxyServer.hostname, port: Number.parseInt(proxyServer.port, 10) } : undefined,
          tld: 'com',
          to: 'en'
        }
      ) as unknown as { data: string[] }
      const { bestMatchIndex } = findBestMatch(questionValue, result.data)
      answerIndex = bestMatchIndex
    }

    await page.click(`input#answer_0_${answerIndex}`)
    await page.evaluate('Form_Check_radio()')
    await page.waitForNavigation()

    if (await page.$('div#false_msg')) {
      await Promise.all([
        page.waitForNavigation(),
        page.click('input.btn-answer-view')
      ])
      const drillForm = await page.$('div#drill_form')
      const elementAnswer = drillForm && await (await drillForm.getProperty('textContent')).jsonValue<string>()
      const answer = elementAnswer?.split('：')[1].replace(/\r?\n/gu, '')
      const currectJson = JSON.parse(readFileSync(answersPath).toString()) as unknown as JSON
      writeJSONSync(answersPath, Object.assign(currectJson, { [questionValue]: answer }))
    } else {
      unitProgress = ((await (await page.$('div.progress_back'))?.boundingBox())?.width || 0) / 2
      logger.info(`current progress: ${unitProgress}% (${unitProgress / 4}/25)`)
    }

    if (unitProgress === 100) {
      logger.info('resolved the unit!')
      return page
    }

    await Promise.all([
      page.waitForNavigation(),
      page.click('input.btn-problem-next')
    ])
  }
}

type ResolveUnitsOptions = {
  firstQuestionNumber?: number,
  lastQuestionNumber?: number,
  sleepPerQuestion?: number,
  proxyServer?: URL
}

const resolveUnits = async (
  page: Page,
  referenceId: number,
  firstUnitId: number,
  lastUnitId: number,
  answersPath: string,
  options?: ResolveUnitsOptions
// eslint-disable-next-line max-params
): Promise<Page> => {
  let currentUnitId = firstUnitId
  if (options && options.firstQuestionNumber) {
    currentUnitId = calcUnitId(firstUnitId, options.firstQuestionNumber - 1) + 4
  }
  if (options && options.lastQuestionNumber) {
    // eslint-disable-next-line no-param-reassign
    lastUnitId = calcUnitId(firstUnitId, options.lastQuestionNumber) + 4
  }

  while (lastUnitId > currentUnitId) {
    await navigateMenuItem(page, 'Study')
    await selectReference(page, referenceId)
    await selectUnit(page, currentUnitId)
    await resolveUnit(page, answersPath, options?.sleepPerQuestion, options?.proxyServer)
      // eslint-disable-next-line no-loop-func
      .then(() => { currentUnitId += 4 })
      .catch((error: Error) => { logger.error(error.message) })
  }

  logger.info('units have been resolved!')

  return page
}

export {
  initBrowser,
  initPage,
  navigateMenuItem,
  selectReference,
  calcUnitId,
  selectUnit,
  resolveUnit,
  resolveUnits
}

/* eslint-enable no-await-in-loop, max-statements, unicorn/no-await-expression-member */
