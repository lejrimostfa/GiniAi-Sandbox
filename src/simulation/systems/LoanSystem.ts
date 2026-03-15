// ============================================================
// LoanSystem — loan repayment, business debt, credit scores
// Users can modify loan mechanics by editing this file
// ============================================================

import type { SimulationContext } from '../SimulationContext'
import { clamp } from '../utils'

// ============================================================
// Main loan processing — called once per tick
// ============================================================
export function processLoans(ctx: SimulationContext): void {
  for (const agent of ctx.agents) {
    if (agent.state === 'dead') continue

    // --- Loan repayment ---
    if (agent.loan > 0 && agent.loanPayment > 0) {
      const payment = Math.min(agent.loanPayment, agent.loan)
      agent.wealth -= payment
      agent.loan -= payment

      // Loan fully repaid
      if (agent.loan <= 0) {
        agent.loan = 0
        agent.loanPayment = 0
        agent.creditScore = clamp(agent.creditScore + 0.05, 0, 1) // good repayment boosts score
      }

      // Default: can't afford payment and wealth too negative
      if (agent.wealth < -300 && agent.loan > 0) {
        agent.satisfaction = clamp(agent.satisfaction - 0.15, 0, 1)
        agent.creditScore = clamp(agent.creditScore - 0.3, 0, 1) // credit score crash
        agent.lifeEvents.push({
          tick: ctx.tick, type: 'loan_default',
          description: `Defaulted on loan (remaining: $${Math.round(agent.loan)})`,
        })
        // Debt remains but payments stop (written off partially)
        agent.loanPayment = 0
        agent.loan *= 0.5 // bank absorbs half
      }
    }

    // --- Business debt repayment ---
    if (agent.state === 'business_owner' && agent.businessDebt > 0 && agent.businessDebtPayment > 0) {
      const bizPayment = Math.min(agent.businessDebtPayment, agent.businessDebt)
      agent.wealth -= bizPayment
      agent.businessDebt -= bizPayment

      // Business debt fully repaid
      if (agent.businessDebt <= 0) {
        agent.businessDebt = 0
        agent.businessDebtPayment = 0
        agent.creditScore = clamp(agent.creditScore + 0.1, 0, 1)
      }

      // Track profitability: revenue vs debt payment
      if (agent.businessRevenue < bizPayment) {
        agent.businessTicksUnprofitable++
      } else {
        agent.businessTicksUnprofitable = Math.max(0, agent.businessTicksUnprofitable - 1)
      }
      // Reset revenue accumulator each tick
      agent.businessRevenue = 0

      // Bankruptcy: unprofitable for too long OR wealth too negative
      // Higher automation = faster failure (1/10 survival rate at high automation)
      const autoLevel = (ctx.params.aiGrowthRate + ctx.params.aiDiffusionRate) / 2
      const bankruptcyYears = 2 - autoLevel * 1.2 // 2 years → 0.8 years at max automation
      const bankruptcyThreshold = Math.max(
        ctx.params.ticksPerYear * 0.5,
        ctx.params.ticksPerYear * bankruptcyYears
      )
      if (agent.businessTicksUnprofitable > bankruptcyThreshold || agent.wealth < -400) {
        ctx.bankruptBusiness(agent)
      }
    }

    // --- Credit score update (once per year) ---
    if (ctx.tick % ctx.params.ticksPerYear === 0) {
      let score = 0.3 // base
      // Employment bonus
      if (agent.state === 'employed' || agent.state === 'business_owner' || agent.state === 'police') score += 0.25
      // Wealth bonus (scaled)
      score += clamp(agent.wealth / 500, 0, 0.2)
      // Income bonus
      score += clamp(agent.income / 100, 0, 0.15)
      // Penalty for existing debt
      if (agent.loan > 0) score -= 0.1
      // Age stability bonus
      if (agent.age > 30) score += 0.05
      // No default history bonus
      if (!agent.lifeEvents.some((e) => e.type === 'loan_default')) score += 0.05
      // Blend with existing score (momentum)
      agent.creditScore = clamp(agent.creditScore * 0.6 + score * 0.4, 0, 1)
    }
  }
}
