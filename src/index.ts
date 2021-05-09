import { config } from 'dotenv'
import {
  initInstance,
  initPage,
  resolveUnits
} from './paddington'

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
    const instance = await initInstance(answersPath, isEnabledHeadless?.toLowerCase() === 'true')
    const page = await initPage(instance, url, id, password)
    await resolveUnits(
      page,
      parseInt(referenceId),
      parseInt(firstUnitId),
      parseInt(lastUnitId),
      answersPath,
      parseInt(firstQuestionNumber),
      parseInt(lastQuestionNumber)
    )
    await page.close()
    await instance.browser.close()
  }
})()
