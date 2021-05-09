import { existsSync, readFileSync, writeFileSync, writeJSONSync } from 'fs-extra'
import translate, { parseMultiple } from 'google-translate-open-api'
import { getLogger, Logger } from 'log4js'
import {
  Browser,
  BrowserContext,
  ElementHandle,
  Page,
  webkit
} from 'playwright'
import { findBestMatch } from 'string-similarity'

const logger: Logger = getLogger()
logger.level = 'all'

type Instance = {
  browser: Browser
  context: BrowserContext
}

const initInstance = async (
  answersPath: string,
  isEnabledHeadless?: boolean
): Promise<Instance> => {
  if (!existsSync(answersPath)) {
    try {
      JSON.parse(readFileSync(answersPath).toString())
    } catch {
      writeFileSync(answersPath, '{}')
    }
  }
  const browser: Browser = await webkit.launch({
    headless: isEnabledHeadless
  })
  const context: BrowserContext = await browser.newContext({
    locale: 'ja',
    ignoreHTTPSErrors: true
  })
  logger.info('instance has been initialized')

  return { browser, context }
}

const initPage = async (
  instance: Instance,
  url: string,
  id: string,
  password: string
): Promise<Page> => {
  const { context } = instance
  const page: Page = await context.newPage()

  await page.goto(url)
  await page.fill('input[name="id"]', id)
  await page.fill('input[name="password"]', password)
  await page.click('input#btn-login')
  await page.waitForEvent('load')
  logger.info('page has been initialized')

  return page
}

type MenuItem = 'Top' | 'Study' | 'QandA' | 'UserInfo'

const navigateMenuItem = async (page: Page, itemName: MenuItem): Promise<Page> => {
  await page.evaluate(`document.${itemName}.submit()`)
  await page.waitForEvent('load')
  logger.info(`navigated to ${itemName}`)

  return page
}

const selectReference = async (page: Page, referenceId: number): Promise<Page> => {
  await page.evaluate(`select_reference('${referenceId}')`)
  await page.waitForEvent('load')
  logger.info(`selected reference:${referenceId}`)

  return page
}

const calcUnitId = (firstUnitId: number, lastQuestionNumber: number): number => {
  return firstUnitId + ((lastQuestionNumber / 25) * 4) - 4
}

const selectUnit = async (page: Page, unitId: number): Promise<Page> => {
  await page.evaluate(`select_unit('drill', '${unitId}', '')`)
  await page.waitForEvent('load')
  logger.info(`selected unit:${unitId}`)

  return page
}

const resolveUnit = async (page: Page, answersPath: string): Promise<Page> => {
  let unitProgress = 0

  while (true) {
    const questionElem = await page.$('div#qu02')
    const questionValue = await questionElem?.textContent()

    if (!questionElem || !questionValue) return page

    const choices: Array<ElementHandle> = await page.$$('input[name="answer[0]"]')
    const values = await Promise.all(choices.map(async (choice) => {
      return await choice.getAttribute('value') || ''
    }))
    const answers = JSON.parse(readFileSync(answersPath).toString())
    const answerKeys: string[] = Object.keys(answers)
    const answerValues: string[] = Object.values(answers)
    let answerIndex: number

    if (answerKeys.includes(questionValue)) {
      answerIndex = values.indexOf(answerValues[answerKeys.indexOf(questionValue)])
    } else {
      const result = await translate(values, { tld: 'com', to: 'en', client: 'dict-chrome-ex' })
      const translatedValues = parseMultiple(result.data[0])
      const { bestMatchIndex } = findBestMatch(questionValue, translatedValues)
      answerIndex = bestMatchIndex
    }

    await page.click(`input#answer_0_${answerIndex}`)
    await page.evaluate('Form_Check_radio()')
    await page.waitForEvent('load')

    if (await page.$('div#false_msg')) {
      await page.click('input.btn-answer-view')
      await page.waitForEvent('load')
      const elemAnswer = await page.textContent('div#drill_form')
      const answer = elemAnswer?.split('：')[1].replace(/\r?\n/g, '')
      const currectJson = JSON.parse(readFileSync(answersPath).toString())
      writeJSONSync(answersPath, Object.assign(currectJson, { [questionValue]: answer }))
    } else {
      unitProgress = ((await (await page.$('div.progress_back'))?.boundingBox())?.width || 0) / 2
      logger.info(`current progress: ${unitProgress}%`)
    }

    if (unitProgress !== 100) {
      await page.click('input.btn-problem-next')
      await page.waitForEvent('load')
    } else {
      logger.info('resolved the unit!')
      return page
    }
  }
}

const resolveUnits = async (
  page: Page,
  referenceId: number,
  firstUnitId: number,
  lastUnitId: number,
  answersPath: string,
  firstQuestionNumber?: number,
  lastQuestionNumber?: number
): Promise<Page> => {
  let currentUnitId = firstUnitId
  if (firstQuestionNumber) {
    currentUnitId = calcUnitId(firstUnitId, firstQuestionNumber - 1) + 4
  }
  if (lastQuestionNumber) {
    lastUnitId = calcUnitId(firstUnitId, lastQuestionNumber) + 4
  }

  while (lastUnitId > currentUnitId) {
    await navigateMenuItem(page, 'Study')
    await selectReference(page, referenceId)
    await selectUnit(page, currentUnitId)
      .then(async (page) => {
        await resolveUnit(page, answersPath)
      }).catch((e) => {
        logger.error(e)
      })
    currentUnitId += 4
  }

  logger.info('units have been resolved!')

  return page
}

export {
  initInstance,
  initPage,
  navigateMenuItem,
  selectReference,
  calcUnitId,
  selectUnit,
  resolveUnit,
  resolveUnits
}
