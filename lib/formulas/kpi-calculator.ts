import Decimal from 'decimal.js';
import { getTERCategory, getTERRate } from './ter-lookup';

// Configure Decimal.js for financial precision (optimized)
Decimal.set({ precision: 10, rounding: Decimal.ROUND_HALF_UP });

/**
 * KPI Category Weights (P1, P2, P3)
 */
export interface CategoryWeight {
  p1: Decimal;
  p2: Decimal;
  p3: Decimal;
}

/**
 * Individual KPI Scores
 */
export interface IndividualScores {
  p1Score: Decimal;
  p2Score: Decimal;
  p3Score: Decimal;
  p1Weighted: Decimal;
  p2Weighted: Decimal;
  p3Weighted: Decimal;
  totalIndividualScore: Decimal;
  activityRupiah: Decimal;
  isActivity: boolean;
}

/**
 * Final Score Calculation
 */
export interface FinalScore {
  unitScore: Decimal;
  individualScore: Decimal;
  unitWeight: Decimal;
  individualWeight: Decimal;
  finalScore: Decimal;
  pirValue?: Decimal; // PIR (Proportion Index Ratio) for index-based distribution
}

/**
 * Financial Distribution
 */
export interface IncentiveDistribution {
  grossIncentive: Decimal;
  taxAmount: Decimal;
  netIncentive: Decimal;
}

/**
 * Calculate individual KPI score with P1, P2, P3 breakdown
 * Formula: Individual Score = (W_p1 × Score_P1) + (W_p2 × Score_P2) + (W_p3 × Score_P3)
 */
export function calculateIndividualScore(
  p1Score: number,
  p2Score: number,
  p3Score: number,
  weights: { p1: number; p2: number; p3: number },
  activityRupiah: number = 0,
  isActivity: boolean = false
): IndividualScores {
  const p1 = new Decimal(p1Score);
  const p2 = new Decimal(p2Score);
  const p3 = new Decimal(p3Score);

  const w1 = new Decimal(weights.p1).div(100);
  const w2 = new Decimal(weights.p2).div(100);
  const w3 = new Decimal(weights.p3).div(100);

  const p1Weighted = p1.mul(w1);
  const p2Weighted = p2.mul(w2);
  const p3Weighted = p3.mul(w3);

  const totalIndividualScore = p1Weighted.plus(p2Weighted).plus(p3Weighted);

  return {
    p1Score: p1,
    p2Score: p2,
    p3Score: p3,
    p1Weighted,
    p2Weighted,
    p3Weighted,
    totalIndividualScore,
    activityRupiah: new Decimal(activityRupiah),
    isActivity
  };
}

/**
 * Calculate final score combining unit and individual performance
 * Formula: Final Score = (W_unit × Score_unit) + (W_individual × Score_individual)
 */
export function calculateFinalScore(
  unitScore: number,
  individualScore: number,
  unitWeight: number,
  individualWeight: number
): FinalScore {
  const uScore = new Decimal(unitScore);
  const iScore = new Decimal(individualScore);
  const uWeight = new Decimal(unitWeight).div(100);
  const iWeight = new Decimal(individualWeight).div(100);

  const weightedUnitScore = uScore.mul(uWeight);
  const weightedIndividualScore = iScore.mul(iWeight);

  const finalScore = weightedUnitScore.plus(weightedIndividualScore);

  return {
    unitScore: uScore,
    individualScore: iScore,
    unitWeight: uWeight,
    individualWeight: iWeight,
    finalScore,
  };
}

/**
 * Calculate pool allocation
 * Formula: Net Pool = Revenue - Deductions
 *          Allocated Amount = Net Pool × Global Allocation %
 */
export function calculatePoolAllocation(
  revenue: number,
  deductions: number,
  globalAllocationPercentage: number
): { netPool: Decimal; allocatedAmount: Decimal } {
  const rev = new Decimal(revenue);
  const ded = new Decimal(deductions);
  const globalAlloc = new Decimal(globalAllocationPercentage).div(100);

  const netPool = rev.minus(ded);
  const allocatedAmount = netPool.mul(globalAlloc);

  return {
    netPool,
    allocatedAmount,
  };
}

/**
 * Calculate unit allocation from total pool
 * Formula: Unit Allocation = Allocated Amount × Unit Proportion %
 */
export function calculateUnitAllocation(
  allocatedAmount: number,
  unitProportionPercentage: number
): Decimal {
  const allocated = new Decimal(allocatedAmount);
  const proportion = new Decimal(unitProportionPercentage).div(100);

  return allocated.mul(proportion);
}

/**
 * Calculate individual incentive from unit pool
 * Formula: Individual Proportion = Employee Final Score / Total Unit Scores
 *          Gross Incentive = Unit Allocation × Individual Proportion
 */
export function calculateIndividualIncentive(
  unitAllocation: number,
  employeeFinalScore: number,
  totalUnitScores: number,
  activityRupiah: number = 0,
  pirValue: number | null = null
): { proportion: Decimal; grossIncentive: Decimal; indexIncentive: Decimal; activityIncentive: Decimal } {
  const unitAlloc = new Decimal(unitAllocation);
  const empScore = new Decimal(employeeFinalScore);
  const totalScore = new Decimal(totalUnitScores);
  const actRupiah = new Decimal(activityRupiah);

  // If PIR is provided, use the new hybrid formula
  if (pirValue !== null) {
    const pir = new Decimal(pirValue);
    const indexIncentive = empScore.mul(pir);
    const grossIncentive = indexIncentive.plus(actRupiah);

    return {
      proportion: totalScore.isZero() ? new Decimal(0) : empScore.div(totalScore),
      grossIncentive,
      indexIncentive,
      activityIncentive: actRupiah
    };
  }

  // Fallback to legacy proportion-based calculation if PIR is not used
  if (totalScore.isZero()) {
    return {
      proportion: new Decimal(0),
      grossIncentive: actRupiah,
      indexIncentive: new Decimal(0),
      activityIncentive: actRupiah
    };
  }

  const proportion = empScore.div(totalScore);
  const indexIncentive = unitAlloc.mul(proportion);
  const grossIncentive = indexIncentive.plus(actRupiah);

  return {
    proportion,
    grossIncentive,
    indexIncentive,
    activityIncentive: actRupiah
  };
}

/**
 * Calculate PIR (Proportion Index Ratio)
 * Formula: PIR = (Unit Allocation - Total Activity Rupiah) / Total Unit Index Scores
 */
export function calculatePIR(
  unitAllocation: number,
  totalActivityRupiah: number,
  totalUnitIndexScores: number
): Decimal {
  const allocation = new Decimal(unitAllocation);
  const totalActivity = new Decimal(totalActivityRupiah);
  const totalScores = new Decimal(totalUnitIndexScores);

  if (totalScores.isZero()) return new Decimal(0);

  const remainingPool = allocation.minus(totalActivity);
  return remainingPool.div(totalScores);
}

/**
 * Calculate PPh 21 using TER (Tarif Efektif Rata-rata) method
 * Based on Indonesian tax regulation PP 58/2023
 */
export function calculatePPh21TER(
  grossIncome: number,
  taxStatus: string = 'TK/0'
): Decimal {
  const gross = new Decimal(grossIncome);

  if (gross.lessThanOrEqualTo(0)) return new Decimal(0);

  // Get TER Category based on PTKP status
  const category = getTERCategory(taxStatus);

  // Get TER Rate based on Category and monthly gross income
  const ratePercentage = getTERRate(category, grossIncome);

  const taxRate = new Decimal(ratePercentage).div(100);

  return gross.mul(taxRate);
}

/**
 * Calculate net incentive after tax
 * Formula: Net Incentive = Gross Incentive - Tax Amount
 */
export function calculateNetIncentive(
  grossIncentive: number,
  taxStatus: string = 'TK/0'
): IncentiveDistribution {
  const gross = new Decimal(grossIncentive);
  const tax = calculatePPh21TER(grossIncentive, taxStatus);
  const net = gross.minus(tax);

  return {
    grossIncentive: gross,
    taxAmount: tax,
    netIncentive: net,
  };
}

/**
 * Calculate achievement percentage
 * Formula: Achievement % = (Realization / Target) × 100
 */
export function calculateAchievementPercentage(
  realization: number,
  target: number
): Decimal {
  if (target === 0) return new Decimal(0);

  const real = new Decimal(realization);
  const tgt = new Decimal(target);

  return real.div(tgt).mul(100);
}

/**
 * Calculate weighted indicator score
 * Formula: Weighted Score = Achievement % × Weight %
 */
export function calculateWeightedIndicatorScore(
  achievementPercentage: number,
  weightPercentage: number
): Decimal {
  const achievement = new Decimal(achievementPercentage).div(100);
  const weight = new Decimal(weightPercentage).div(100);

  return achievement.mul(weight).mul(100);
}

/**
 * Calculate direct rupiah from activity saturation
 * Formula: Activity Rupiah = Realization × Basic Index Value
 */
export function calculateActivityRupiah(
  realization: number,
  basicIndexValue: number
): Decimal {
  const real = new Decimal(realization);
  const biv = new Decimal(basicIndexValue);

  return real.mul(biv);
}

/**
 * Aggregate category score from multiple indicators
 * Formula: Category Score = Σ(Weighted Indicator Scores)
 */
export function aggregateCategoryScore(
  indicatorScores: number[]
): Decimal {
  return indicatorScores.reduce(
    (sum, score) => sum.plus(new Decimal(score)),
    new Decimal(0)
  );
}

/**
 * Convert Decimal to number for database storage
 */
export function toNumber(decimal: Decimal): number {
  return decimal.toNumber();
}

/**
 * Convert Decimal to fixed decimal string
 */
export function toFixed(decimal: Decimal, decimalPlaces: number = 2): string {
  return decimal.toFixed(decimalPlaces);
}

/**
 * Format currency for display (IDR)
 */
export function formatCurrency(amount: Decimal | number): string {
  const value = amount instanceof Decimal ? amount.toNumber() : amount;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: Decimal | number, decimalPlaces: number = 2): string {
  const num = value instanceof Decimal ? value.toNumber() : value;
  return `${num.toFixed(decimalPlaces)}%`;
}
