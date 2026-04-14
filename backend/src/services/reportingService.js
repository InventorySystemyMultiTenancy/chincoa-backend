import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';

function normalizeDate(value) {
  return String(value || '').trim();
}

function normalizeAmount(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError('Valor deve ser maior que zero', 400, 'VALIDATION_ERROR');
  }

  return Number(parsed.toFixed(2));
}

export async function createFixedExpense({ title, amount, startsOn, endsOn, isActive, notes }) {
  const normalizedTitle = String(title || '').trim();
  const normalizedStartsOn = normalizeDate(startsOn);
  const normalizedEndsOn = endsOn ? normalizeDate(endsOn) : null;
  const normalizedAmount = normalizeAmount(amount);

  if (!normalizedTitle) {
    throw new AppError('Titulo do gasto fixo e obrigatorio', 400, 'VALIDATION_ERROR');
  }

  const result = await query(
    `
      INSERT INTO admin_fixed_expenses (title, amount, starts_on, ends_on, is_active, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, title, amount, starts_on, ends_on, is_active, notes, created_at, updated_at
    `,
    [
      normalizedTitle,
      normalizedAmount,
      normalizedStartsOn,
      normalizedEndsOn,
      Boolean(isActive ?? true),
      notes ? String(notes).trim() : null,
    ],
  );

  return {
    ...result.rows[0],
    amount: Number(result.rows[0].amount),
  };
}

export async function listFixedExpenses() {
  const result = await query(
    `
      SELECT id, title, amount, starts_on, ends_on, is_active, notes, created_at, updated_at
      FROM admin_fixed_expenses
      ORDER BY is_active DESC, title ASC
    `,
  );

  return result.rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
}

export async function updateFixedExpense({ id, title, amount, startsOn, endsOn, isActive, notes }) {
  const current = await query(
    `
      SELECT id, title, amount, starts_on, ends_on, is_active, notes, created_at, updated_at
      FROM admin_fixed_expenses
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  if (current.rowCount === 0) {
    throw new AppError('Gasto fixo nao encontrado', 404, 'NOT_FOUND');
  }

  const existing = current.rows[0];

  const nextTitle = title !== undefined ? String(title || '').trim() : existing.title;
  if (!nextTitle) {
    throw new AppError('Titulo do gasto fixo e obrigatorio', 400, 'VALIDATION_ERROR');
  }

  const nextAmount = amount !== undefined ? normalizeAmount(amount) : Number(existing.amount);
  const nextStartsOn = startsOn !== undefined ? normalizeDate(startsOn) : existing.starts_on;
  const nextEndsOn = endsOn !== undefined ? (endsOn ? normalizeDate(endsOn) : null) : existing.ends_on;
  const nextIsActive = isActive !== undefined ? Boolean(isActive) : existing.is_active;
  const nextNotes = notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes;

  const result = await query(
    `
      UPDATE admin_fixed_expenses
      SET
        title = $2,
        amount = $3,
        starts_on = $4,
        ends_on = $5,
        is_active = $6,
        notes = $7,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, title, amount, starts_on, ends_on, is_active, notes, created_at, updated_at
    `,
    [id, nextTitle, nextAmount, nextStartsOn, nextEndsOn, nextIsActive, nextNotes],
  );

  return {
    ...result.rows[0],
    amount: Number(result.rows[0].amount),
  };
}

export async function createVariableExpense({ title, amount, expenseDate, notes }) {
  const normalizedTitle = String(title || '').trim();
  const normalizedDate = normalizeDate(expenseDate);
  const normalizedAmount = normalizeAmount(amount);

  if (!normalizedTitle) {
    throw new AppError('Titulo do gasto variavel e obrigatorio', 400, 'VALIDATION_ERROR');
  }

  const result = await query(
    `
      INSERT INTO admin_variable_expenses (title, amount, expense_date, notes)
      VALUES ($1, $2, $3, $4)
      RETURNING id, title, amount, expense_date, notes, created_at, updated_at
    `,
    [normalizedTitle, normalizedAmount, normalizedDate, notes ? String(notes).trim() : null],
  );

  return {
    ...result.rows[0],
    amount: Number(result.rows[0].amount),
  };
}

export async function listVariableExpenses({ startDate, endDate }) {
  const params = [];
  const clauses = [];

  if (startDate) {
    params.push(startDate);
    clauses.push(`expense_date >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    clauses.push(`expense_date <= $${params.length}`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await query(
    `
      SELECT id, title, amount, expense_date, notes, created_at, updated_at
      FROM admin_variable_expenses
      ${where}
      ORDER BY expense_date DESC, created_at DESC
    `,
    params,
  );

  return result.rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
}

export async function updateVariableExpense({ id, title, amount, expenseDate, notes }) {
  const current = await query(
    `
      SELECT id, title, amount, expense_date, notes, created_at, updated_at
      FROM admin_variable_expenses
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  if (current.rowCount === 0) {
    throw new AppError('Gasto variavel nao encontrado', 404, 'NOT_FOUND');
  }

  const existing = current.rows[0];

  const nextTitle = title !== undefined ? String(title || '').trim() : existing.title;
  if (!nextTitle) {
    throw new AppError('Titulo do gasto variavel e obrigatorio', 400, 'VALIDATION_ERROR');
  }

  const nextAmount = amount !== undefined ? normalizeAmount(amount) : Number(existing.amount);
  const nextExpenseDate = expenseDate !== undefined ? normalizeDate(expenseDate) : existing.expense_date;
  const nextNotes = notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes;

  const result = await query(
    `
      UPDATE admin_variable_expenses
      SET
        title = $2,
        amount = $3,
        expense_date = $4,
        notes = $5,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, title, amount, expense_date, notes, created_at, updated_at
    `,
    [id, nextTitle, nextAmount, nextExpenseDate, nextNotes],
  );

  return {
    ...result.rows[0],
    amount: Number(result.rows[0].amount),
  };
}

export async function getFinancialReport({ startDate, endDate }) {
  const paidResult = await query(
    `
      SELECT
        COUNT(*)::int AS paid_count,
        COALESCE(SUM(price), 0)::numeric AS paid_total
      FROM appointments
      WHERE status = 'pago'
        AND appointment_date BETWEEN $1 AND $2
    `,
    [startDate, endDate],
  );

  const fixedBreakdownResult = await query(
    `
      WITH months AS (
        SELECT date_trunc('month', gs)::date AS month_start
        FROM generate_series(
          date_trunc('month', $1::date),
          date_trunc('month', $2::date),
          '1 month'::interval
        ) AS gs
      )
      SELECT
        f.id,
        f.title,
        f.amount,
        COUNT(m.month_start)::int AS months_applied,
        (f.amount * COUNT(m.month_start))::numeric AS total
      FROM admin_fixed_expenses f
      LEFT JOIN months m
        ON f.is_active = true
       AND m.month_start >= date_trunc('month', f.starts_on)::date
       AND (f.ends_on IS NULL OR m.month_start <= date_trunc('month', f.ends_on)::date)
      GROUP BY f.id, f.title, f.amount
      ORDER BY f.title ASC
    `,
    [startDate, endDate],
  );

  const variableResult = await query(
    `
      SELECT
        id,
        title,
        amount,
        expense_date,
        notes,
        created_at,
        updated_at
      FROM admin_variable_expenses
      WHERE expense_date BETWEEN $1 AND $2
      ORDER BY expense_date ASC, created_at ASC
    `,
    [startDate, endDate],
  );

  const paidCount = Number(paidResult.rows[0]?.paid_count || 0);
  const revenueTotal = Number(paidResult.rows[0]?.paid_total || 0);

  const fixedBreakdown = fixedBreakdownResult.rows.map((row) => ({
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    months_applied: Number(row.months_applied),
    total: Number(row.total),
  }));

  const fixedTotal = fixedBreakdown.reduce((sum, item) => sum + item.total, 0);

  const variableExpenses = variableResult.rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));

  const variableTotal = variableExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpenses = fixedTotal + variableTotal;

  return {
    period: {
      start_date: startDate,
      end_date: endDate,
    },
    revenue: {
      paid_appointments_count: paidCount,
      paid_total: Number(revenueTotal.toFixed(2)),
    },
    expenses: {
      fixed_total: Number(fixedTotal.toFixed(2)),
      variable_total: Number(variableTotal.toFixed(2)),
      total: Number(totalExpenses.toFixed(2)),
      fixed_breakdown: fixedBreakdown,
      variable_items: variableExpenses,
    },
    net_profit: Number((revenueTotal - totalExpenses).toFixed(2)),
  };
}
