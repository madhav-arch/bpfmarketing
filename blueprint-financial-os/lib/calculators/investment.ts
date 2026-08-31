import type { AuditLine } from '../domain/types';
import type { LenderPolicy, ModellingAssumptions } from '../rules/types';
import { pmt } from './finance';

export interface InvestmentInput {
  purchasePrice: number;
  depositCash: number;
  depositEquity: number;
  rate: number;
  termYears: number;
  interestOnly: boolean;
  rentPerWeek: number;
  ratesPerYear: number;
  insurancePerYear: number;
  propertyMgmtRate?: number;
  maintenanceRate?: number;
  vacancyWeeks?: number;
}

export interface InvestmentResult {
  loan: number;
  grossYield: number;
  netYield: number;
  weeklyCashflow: number;
  monthlyCashflow: number;
  annualCashflow: number;
  cashRequired: number;
  debtAdded: number;
  mortgageWeekly: number;
  operatingCostsWeekly: number;
  netRentWeekly: number;
  /** Servicing drag: how much personal income/month the property consumes
   *  under lender stress testing (negative = it supports servicing). */
  servicingDragMonthly: number;
  recognisedRentMonthly: number;
  stressedRepaymentMonthly: number;
  audit: AuditLine[];
}

export function computeInvestment(
  input: InvestmentInput,
  policy: LenderPolicy,
  modelling: ModellingAssumptions,
): InvestmentResult {
  const loan = Math.max(0, input.purchasePrice - input.depositCash - input.depositEquity);
  const pmRate = input.propertyMgmtRate ?? modelling.defaultPropertyMgmtRate;
  const maintRate = input.maintenanceRate ?? modelling.defaultMaintenanceRate;
  const vacancyWeeks = input.vacancyWeeks ?? modelling.vacancyWeeksPerYear;

  const annualRentGross = input.rentPerWeek * 52;
  const effectiveWeeks = 52 - vacancyWeeks;
  const annualRentReceived = input.rentPerWeek * effectiveWeeks;
  const pmCost = annualRentReceived * pmRate;
  const maintCost = annualRentReceived * maintRate;
  const operatingAnnual = input.ratesPerYear + input.insurancePerYear + pmCost + maintCost;
  const mortgageWeekly = input.interestOnly
    ? (loan * input.rate) / 52
    : pmt(input.rate / 52, input.termYears * 52, loan);
  const mortgageAnnual = mortgageWeekly * 52;
  const annualCashflow = annualRentReceived - operatingAnnual - mortgageAnnual;

  // Bank view
  const recognisedRentMonthly = input.rentPerWeek * policy.weeklyToMonthly * policy.rentalScaling;
  const stressedRepaymentMonthly = pmt(policy.stressRate / 12, policy.maxTermYears * 12, loan);
  const servicingDragMonthly = stressedRepaymentMonthly - recognisedRentMonthly;

  const grossYield = input.purchasePrice > 0 ? annualRentGross / input.purchasePrice : 0;
  const netYield = input.purchasePrice > 0 ? (annualRentReceived - operatingAnnual) / input.purchasePrice : 0;

  return {
    loan,
    grossYield,
    netYield,
    weeklyCashflow: annualCashflow / 52,
    monthlyCashflow: annualCashflow / 12,
    annualCashflow,
    cashRequired: input.depositCash,
    debtAdded: loan + input.depositEquity, // equity deposit is usually borrowed against other property
    mortgageWeekly,
    operatingCostsWeekly: operatingAnnual / 52,
    netRentWeekly: (annualRentReceived - operatingAnnual) / 52,
    servicingDragMonthly,
    recognisedRentMonthly,
    stressedRepaymentMonthly,
    audit: [
      { label: 'Purchase price', value: input.purchasePrice, format: 'currency' },
      { label: 'Lending required', value: loan, format: 'currency' },
      { label: `Gross yield (rent × 52 ÷ price)`, value: grossYield, format: 'percent' },
      { label: `Rent received (${effectiveWeeks} weeks — ${vacancyWeeks}wk vacancy allowance)`, value: annualRentReceived, format: 'currency' },
      { label: `Operating costs (rates, insurance, PM ${(pmRate * 100).toFixed(0)}%, maintenance ${(maintRate * 100).toFixed(0)}%)`, value: -operatingAnnual, format: 'currency' },
      { label: `Mortgage (${input.interestOnly ? 'interest-only' : 'P&I'} @ ${(input.rate * 100).toFixed(2)}%)`, value: -mortgageAnnual, format: 'currency' },
      { label: 'Annual cashflow', value: annualCashflow, format: 'currency' },
      {
        label: 'Servicing drag (bank stress view, per month)',
        value: servicingDragMonthly,
        format: 'currency',
        note:
          servicingDragMonthly > 0
            ? 'Under stress testing this property needs this much of your personal income each month — low-yield purchases eat borrowing capacity.'
            : 'Under stress testing the recognised rent more than covers the stressed repayment — the property carries itself in the bank’s eyes.',
      },
    ],
  };
}
