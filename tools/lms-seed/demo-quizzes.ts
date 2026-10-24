export interface DemoQuizOption {
  id: string
  text: string
}

export interface DemoQuizQuestion {
  id: string
  questionText: string
  options: DemoQuizOption[]
  correctOptionId: string
  explanation?: string
}

export interface DemoQuiz {
  id: string
  slug: string
  title: string
  summary: string
  passThresholdPercent: number
  questions: DemoQuizQuestion[]
}

export const DEMO_QUIZZES: DemoQuiz[] = [
  {
    id: 'demo-stepup-quiz-lab-safety',
    slug: 'demo-stepup-quiz-lab-safety',
    title: 'Lab Safety Basics Assessment',
    summary:
      'Required evaluation on biosafety levels, personal protective equipment (PPE), chemical hazard management, and sharps disposal protocol.',
    passThresholdPercent: 75,
    questions: [
      {
        id: 'q_biosafety_level',
        questionText:
          'Which Biosafety Level (BSL) applies to research working with well-characterized agents not known to consistently cause disease in immunocompetent adult humans?',
        options: [
          { id: 'opt_bsl_1', text: 'Biosafety Level 1 (BSL-1)' },
          { id: 'opt_bsl_2', text: 'Biosafety Level 2 (BSL-2)' },
          { id: 'opt_bsl_3', text: 'Biosafety Level 3 (BSL-3)' },
          { id: 'opt_bsl_4', text: 'Biosafety Level 4 (BSL-4)' },
        ],
        correctOptionId: 'opt_bsl_1',
        explanation:
          'BSL-1 is suitable for standard research with non-pathogenic agents requiring basic microbiological practices.',
      },
      {
        id: 'q_ppe_acids',
        questionText:
          'When handling concentrated acids or volatile solvents in a fume hood, which PPE configuration is mandatory?',
        options: [
          { id: 'opt_ppe_minimal', text: 'Standard prescription glasses and cotton gloves' },
          {
            id: 'opt_ppe_complete',
            text: 'Chemical splash goggles, buttoned lab coat, closed-toe shoes, and chemical-resistant nitrile gloves',
          },
          { id: 'opt_ppe_open', text: 'Face shield with open-toed sandals and no gloves' },
          { id: 'opt_ppe_dust', text: 'Dust mask and latex exam gloves only' },
        ],
        correctOptionId: 'opt_ppe_complete',
        explanation:
          'Chemical splash goggles protect eyes from vapors, nitrile gloves protect skin, closed shoes protect feet, and buttoned lab coats shield clothing.',
      },
      {
        id: 'q_spill_response',
        questionText:
          'What is the immediate primary step to take when a liquid chemical spill occurs on a workbench?',
        options: [
          { id: 'opt_spill_sink', text: 'Immediately flush the liquid down the standard sink drain' },
          {
            id: 'opt_spill_alert',
            text: 'Alert personnel in the immediate vicinity, inform the lab supervisor, and consult the Safety Data Sheet (SDS)',
          },
          { id: 'opt_spill_ignore', text: 'Leave the spill uncovered until the end of the day' },
          { id: 'opt_spill_paper', text: 'Mop it with dry paper towels without wearing gloves' },
        ],
        correctOptionId: 'opt_spill_alert',
        explanation:
          'Alerting personnel and checking the SDS ensures the spill is safely contained and neutralized without risk of toxic reactions.',
      },
      {
        id: 'q_sharps_disposal',
        questionText:
          'Where must broken glass pipettes, contaminated capillary tubes, and scalpel blades be discarded?',
        options: [
          { id: 'opt_waste_trash', text: 'In the standard lined office wastebasket' },
          { id: 'opt_waste_sharps', text: 'In a dedicated, rigid puncture-resistant sharps container' },
          { id: 'opt_waste_recycle', text: 'In the general paper and cardboard recycling bin' },
          { id: 'opt_waste_sink', text: 'In the autoclave bag after rinsing with tap water' },
        ],
        correctOptionId: 'opt_waste_sharps',
        explanation:
          'Sharps must always be placed into rigid puncture-resistant containers to prevent injury and contamination.',
      },
    ],
  },
]
