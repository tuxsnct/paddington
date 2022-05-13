import { existsSync, readFileSync, writeFileSync, writeJSONSync } from 'fs-extra'
import translate from 'google-translate-open-api'
import { getLogger, Logger } from 'log4js'
import puppeteer from 'puppeteer-extra'
import type { Browser, ElementHandle, Page } from 'puppeteer'
import { findBestMatch } from 'string-similarity'
import { setTimeout } from 'timers/promises'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

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
  const args = ['--lang=ja']
  proxyServer && args.push(`--proxy-server=${proxyServer.toString()}`)
  const browser = await puppeteer.launch({ args, headless: isEnabledHeadless })
  logger.info('instance has been initialized')

  return browser
}

const initPage = async (
  browser: Browser,
  url: string,
  id: string,
  password: string
): Promise<Page> => {
  const page = (await browser.pages())[0]
  await page.goto(url, {waitUntil: "load"})
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
  await page.waitForNavigation({ waitUntil: 'load' })
  logger.info(`navigated to ${itemName}`)

  return page
}

const selectReference = async (page: Page, referenceId: number): Promise<Page> => {
  await page.evaluate(`select_reference('${referenceId}')`)
  await page.waitForNavigation({ waitUntil: 'load' })
  logger.info(`selected reference:${referenceId}`)

  return page
}

const calcUnitId = (firstUnitId: number, lastQuestionNumber: number): number => {
  return firstUnitId + ((lastQuestionNumber / 25) * 4) - 4
}

const selectUnit = async (page: Page, unitId: number): Promise<Page> => {
  await page.evaluate(`select_unit('drill', '${unitId}', '')`)
  await page.waitForNavigation({ waitUntil: 'load' })
  logger.info(`selected unit:${unitId}`)
2600
  return page
}

const resolveUnit = async (page: Page, answersPath: string, sleepPerQuestion?: number, proxyServer?: URL): Promise<Page> => {
  let unitProgress = 0

  while (true) {
    sleepPerQuestion && await setTimeout(sleepPerQuestion)

    const questionElem = await page.$('div#qu02')
    const questionValue = questionElem && await (await questionElem.getProperty('textContent')).jsonValue<string>()

    if (!questionElem || !questionValue) return page

    const choices: Array<ElementHandle> = await page.$$('input[name="answer[0]"]')
    const values = await Promise.all(choices.map(async (choice) => {
      return (await choice.getProperty('value')).jsonValue<string>() || ''
    }))
    const answers = JSON.parse(readFileSync(answersPath).toString())
    const answerKeys: string[] = Object.keys(answers)
    const answerValues: string[] = Object.values(answers)
    let answerIndex = 0;

    if (answerKeys.includes(questionValue)) {
      answerIndex = values.indexOf(answerValues[answerKeys.indexOf(questionValue)])
    } else {
      const result = await translate(
        values,
        {
          tld: 'com',
          from: 'ja',
          to: 'en',
          client: 'dict-chrome-ex',
          proxy: proxyServer ? { host: proxyServer.hostname, port: Number.parseInt(proxyServer.port, 10) }: undefined
        }
      )
      const { bestMatchIndex, bestMatch, ratings } = findBestMatch(questionValue, result.data)
      logger.info(`${questionValue}: ${bestMatch.rating}`)
      answerIndex = bestMatchIndex
    }

    await page.click(`input#answer_0_${answerIndex}`)
    await page.evaluate('Form_Check_radio()')
    await page.waitForNavigation({ waitUntil: 'load' })

    if (await page.$('div#false_msg')) {
      await Promise.all([
        page.waitForNavigation(),
        page.click('input.btn-answer-view')
      ])
      const drillForm = await page.$('div#drill_form')
      const elemAnswer = drillForm && await (await drillForm.getProperty('textContent')).jsonValue<string>()
      const answer = elemAnswer?.split('：')[1].replace(/\r?\n/g, '')
      const currectJson = JSON.parse(readFileSync(answersPath).toString())
      writeJSONSync(answersPath, Object.assign(currectJson, { [questionValue]: answer }))
    } else {
      unitProgress = ((await (await page.$('div.progress_back'))?.boundingBox())?.width || 0) / 2
      logger.info(`current progress: ${unitProgress}%`)
    }

    if (unitProgress !== 100) {
      await Promise.all([
        page.waitForNavigation(),
        page.click('input.btn-problem-next')
      ])
    } else {
      logger.info('resolved the unit!')
      return page
    }
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
): Promise<Page> => {
  let currentUnitId = firstUnitId
  if (options && options.firstQuestionNumber) {
    currentUnitId = calcUnitId(firstUnitId, options.firstQuestionNumber - 1) + 4
  }
  if (options && options.lastQuestionNumber) {
    lastUnitId = calcUnitId(firstUnitId, options.lastQuestionNumber) + 4
  }

  while (lastUnitId > currentUnitId) {
    await navigateMenuItem(page, 'Study')
    await selectReference(page, referenceId)
    await selectUnit(page, currentUnitId)
      .then(async (page) => {
        await resolveUnit(page, answersPath, options?.sleepPerQuestion, options?.proxyServer)
      }).catch((e) => {
        logger.error(e)
      })
    currentUnitId += 4
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
