import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseGroupDto } from './dto/create-expense-group.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { AddExpenseDto } from './dto/add-expense.dto';
import { SettleExpenseDto } from './dto/settle-expense.dto';

@Injectable()
export class ExpenseService {
  private readonly logger = new Logger(ExpenseService.name);

  private readonly AI_BASE_URL =
    process.env.AI_ENGINE_URL ||
    'https://travaliy-ai-engine.onrender.com';

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2 — EXPENSE GROUP APIs
  // ═══════════════════════════════════════════════════════════════════════

  // ─── CREATE EXPENSE GROUP ──────────────────────────────────────────────

  async createGroup(userId: string, dto: CreateExpenseGroupDto) {
    this.logger.log(`Creating expense group for trip ${dto.tripId}`);

    // Validate trip exists and belongs to user
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
    });

    if (!trip) {
      throw new NotFoundException({
        success: false,
        message: 'Trip not found',
      });
    }

    if (trip.userId !== userId) {
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to this trip',
      });
    }

    // Check if expense group already exists for this trip
    const existingGroup = await this.prisma.expenseGroup.findUnique({
      where: { tripId: dto.tripId },
    });

    if (existingGroup) {
      throw new ConflictException({
        success: false,
        message: 'An expense group already exists for this trip',
      });
    }

    // Create group + auto-add creator as first member (transaction)
    const group = await this.prisma.$transaction(async (tx) => {
      const newGroup = await tx.expenseGroup.create({
        data: {
          tripId: dto.tripId,
          title: dto.title,
        },
      });

      await tx.expenseMember.create({
        data: {
          groupId: newGroup.id,
          userId,
        },
      });

      return newGroup;
    });

    // Return with members included
    const result = await this.prisma.expenseGroup.findUnique({
      where: { id: group.id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    return {
      success: true,
      message: 'Expense group created successfully',
      data: result,
    };
  }

  // ─── GET EXPENSE GROUP ─────────────────────────────────────────────────

  async getGroup(userId: string, tripId: string) {
    const group = await this.prisma.expenseGroup.findUnique({
      where: { tripId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        expenses: true,
      },
    });

    if (!group) {
      throw new NotFoundException({
        success: false,
        message: 'No expense group found for this trip',
      });
    }

    // Verify user is a member
    await this.verifyMembership(group.id, userId);

    // Calculate totals
    const totalExpenses = group.expenses.reduce((sum, e) => sum + e.amount, 0);
    const memberCount = group.members.length;

    return {
      success: true,
      message: 'Expense group retrieved successfully',
      data: {
        id: group.id,
        tripId: group.tripId,
        title: group.title,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        members: group.members,
        totalExpenses,
        memberCount,
        perPersonAverage: memberCount > 0 ? Math.round((totalExpenses / memberCount) * 100) / 100 : 0,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 3 — MEMBER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  // ─── ADD MEMBER ────────────────────────────────────────────────────────

  async addMember(userId: string, dto: AddMemberDto) {
    this.logger.log(`Adding member ${dto.userId} to group ${dto.groupId}`);

    // Validate group exists
    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: dto.groupId },
    });

    if (!group) {
      throw new NotFoundException({
        success: false,
        message: 'Expense group not found',
      });
    }

    // Verify the requester is a member of this group
    await this.verifyMembership(dto.groupId, userId);

    // Validate user to be added exists
    const userToAdd = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!userToAdd) {
      throw new NotFoundException({
        success: false,
        message: 'User to add not found',
      });
    }

    // Check for duplicate membership
    const existingMember = await this.prisma.expenseMember.findUnique({
      where: {
        groupId_userId: {
          groupId: dto.groupId,
          userId: dto.userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException({
        success: false,
        message: 'User is already a member of this expense group',
      });
    }

    const member = await this.prisma.expenseMember.create({
      data: {
        groupId: dto.groupId,
        userId: dto.userId,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      success: true,
      message: 'Member added successfully',
      data: member,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 4 — EXPENSE APIs
  // ═══════════════════════════════════════════════════════════════════════

  // ─── ADD EXPENSE (Equal Split) ─────────────────────────────────────────

  async addExpense(userId: string, dto: AddExpenseDto) {
    this.logger.log(`Adding expense to group ${dto.groupId}`);

    // Validate group exists
    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: dto.groupId },
      include: { members: true },
    });

    if (!group) {
      throw new NotFoundException({
        success: false,
        message: 'Expense group not found',
      });
    }

    // Verify requester is a member
    await this.verifyMembership(dto.groupId, userId);

    // Validate payer is a member
    const payerIsMember = group.members.some((m) => m.userId === dto.paidByUserId);
    if (!payerIsMember) {
      throw new BadRequestException({
        success: false,
        message: 'Payer is not a member of this expense group',
      });
    }

    // Validate all split users are members
    const memberUserIds = group.members.map((m) => m.userId);
    for (const uid of dto.splitAmongUserIds) {
      if (!memberUserIds.includes(uid)) {
        throw new BadRequestException({
          success: false,
          message: `User ${uid} is not a member of this expense group`,
        });
      }
    }

    if (dto.splitAmongUserIds.length === 0) {
      throw new BadRequestException({
        success: false,
        message: 'At least one user must be in the split list',
      });
    }

    // Equal split calculation
    const splitAmount = Math.round((dto.amount / dto.splitAmongUserIds.length) * 100) / 100;

    // Create expense + splits in a transaction
    const expense = await this.prisma.$transaction(async (tx) => {
      const newExpense = await tx.expense.create({
        data: {
          groupId: dto.groupId,
          title: dto.title,
          description: dto.description,
          amount: dto.amount,
          category: dto.category,
          paidByUserId: dto.paidByUserId,
        },
      });

      // Create split records for each user
      const splitData = dto.splitAmongUserIds.map((uid) => ({
        expenseId: newExpense.id,
        userId: uid,
        amountOwed: splitAmount,
        isSettled: false,
      }));

      await tx.expenseSplit.createMany({ data: splitData });

      return newExpense;
    });

    // Return with full details
    const result = await this.prisma.expense.findUnique({
      where: { id: expense.id },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return {
      success: true,
      message: 'Expense added successfully',
      data: result,
    };
  }

  // ─── GET GROUP EXPENSES ────────────────────────────────────────────────

  async getGroupExpenses(userId: string, groupId: string) {
    // Validate group exists
    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException({
        success: false,
        message: 'Expense group not found',
      });
    }

    // Verify membership
    await this.verifyMembership(groupId, userId);

    const expenses = await this.prisma.expense.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      success: true,
      message: 'Expenses retrieved successfully',
      data: {
        expenses,
        totalAmount,
        count: expenses.length,
      },
    };
  }

  // ─── DELETE EXPENSE ────────────────────────────────────────────────────

  async deleteExpense(userId: string, expenseId: string) {
    this.logger.log(`Deleting expense ${expenseId}`);

    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      include: { group: { include: { members: true } } },
    });

    if (!expense) {
      throw new NotFoundException({
        success: false,
        message: 'Expense not found',
      });
    }

    // Verify requester is a member of the group
    await this.verifyMembership(expense.groupId, userId);

    // Delete expense (splits cascade automatically via onDelete: Cascade)
    await this.prisma.expense.delete({
      where: { id: expenseId },
    });

    return {
      success: true,
      message: 'Expense deleted successfully',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 5 — BALANCE ENGINE
  // ═══════════════════════════════════════════════════════════════════════

  // ─── GET BALANCES ──────────────────────────────────────────────────────

  async getBalances(userId: string, groupId: string) {
    this.logger.log(`Calculating balances for group ${groupId}`);

    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (!group) {
      throw new NotFoundException({
        success: false,
        message: 'Expense group not found',
      });
    }

    await this.verifyMembership(groupId, userId);

    // Get all expenses with splits
    const expenses = await this.prisma.expense.findMany({
      where: { groupId },
      include: { splits: true },
    });

    // Get all settlements
    const settlements = await this.prisma.expenseSettlement.findMany({
      where: { groupId },
    });

    // Build net balance map: userId -> net amount
    // Positive = others owe them. Negative = they owe others.
    const netBalance: Record<string, number> = {};

    // Initialize all members to 0
    for (const member of group.members) {
      netBalance[member.userId] = 0;
    }

    // For each expense: payer gets +amount, each split user gets -amountOwed
    for (const expense of expenses) {
      netBalance[expense.paidByUserId] =
        (netBalance[expense.paidByUserId] || 0) + expense.amount;

      for (const split of expense.splits) {
        netBalance[split.userId] =
          (netBalance[split.userId] || 0) - split.amountOwed;
      }
    }

    // Apply settlements: payer sent money (reduce their debt), receiver received money
    for (const settlement of settlements) {
      netBalance[settlement.payerUserId] =
        (netBalance[settlement.payerUserId] || 0) + settlement.amount;
      netBalance[settlement.receiverUserId] =
        (netBalance[settlement.receiverUserId] || 0) - settlement.amount;
    }

    // Greedy algorithm to minimize transactions
    const creditors: { userId: string; amount: number }[] = [];
    const debtors: { userId: string; amount: number }[] = [];

    for (const [uid, balance] of Object.entries(netBalance)) {
      const rounded = Math.round(balance * 100) / 100;
      if (rounded > 0.01) {
        creditors.push({ userId: uid, amount: rounded });
      } else if (rounded < -0.01) {
        debtors.push({ userId: uid, amount: Math.abs(rounded) });
      }
    }

    // Sort descending by amount
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const transactions: { from: string; fromName: string; to: string; toName: string; amount: number }[] = [];

    // Build user name map
    const nameMap: Record<string, string> = {};
    for (const member of group.members) {
      nameMap[member.userId] = member.user.name;
    }

    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const settleAmount = Math.min(debtors[i].amount, creditors[j].amount);
      const rounded = Math.round(settleAmount * 100) / 100;

      if (rounded > 0) {
        transactions.push({
          from: debtors[i].userId,
          fromName: nameMap[debtors[i].userId] || 'Unknown',
          to: creditors[j].userId,
          toName: nameMap[creditors[j].userId] || 'Unknown',
          amount: rounded,
        });
      }

      debtors[i].amount -= settleAmount;
      creditors[j].amount -= settleAmount;

      if (debtors[i].amount < 0.01) i++;
      if (creditors[j].amount < 0.01) j++;
    }

    return {
      success: true,
      message: 'Balances calculated successfully',
      data: {
        balances: transactions,
        memberSummaries: group.members.map((m) => ({
          userId: m.userId,
          name: m.user.name,
          netBalance: Math.round((netBalance[m.userId] || 0) * 100) / 100,
        })),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 6 — SETTLEMENT SYSTEM
  // ═══════════════════════════════════════════════════════════════════════

  // ─── SETTLE PAYMENT ────────────────────────────────────────────────────

  async settlePayment(userId: string, dto: SettleExpenseDto) {
    this.logger.log(`Recording settlement in group ${dto.groupId}`);

    // Validate group exists
    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: dto.groupId },
    });

    if (!group) {
      throw new NotFoundException({
        success: false,
        message: 'Expense group not found',
      });
    }

    // Verify requester is a member
    await this.verifyMembership(dto.groupId, userId);

    // Verify payer and receiver are both members
    await this.verifyMembership(dto.groupId, dto.payerUserId);
    await this.verifyMembership(dto.groupId, dto.receiverUserId);

    if (dto.payerUserId === dto.receiverUserId) {
      throw new BadRequestException({
        success: false,
        message: 'Payer and receiver cannot be the same person',
      });
    }

    const settlement = await this.prisma.expenseSettlement.create({
      data: {
        groupId: dto.groupId,
        payerUserId: dto.payerUserId,
        receiverUserId: dto.receiverUserId,
        amount: dto.amount,
      },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        receiver: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      success: true,
      message: 'Settlement recorded successfully',
      data: settlement,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 7 — ANALYTICS APIs
  // ═══════════════════════════════════════════════════════════════════════

  // ─── EXPENSE SUMMARY ──────────────────────────────────────────────────

  async getSummary(userId: string, groupId: string) {
    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      include: {
        members: true,
        expenses: true,
      },
    });

    if (!group) {
      throw new NotFoundException({
        success: false,
        message: 'Expense group not found',
      });
    }

    await this.verifyMembership(groupId, userId);

    const totalTripCost = group.expenses.reduce((sum, e) => sum + e.amount, 0);
    const memberCount = group.members.length;
    const perPersonCost = memberCount > 0 ? Math.round((totalTripCost / memberCount) * 100) / 100 : 0;

    // Category totals
    const categoryTotals: Record<string, number> = {};
    for (const expense of group.expenses) {
      categoryTotals[expense.category] =
        (categoryTotals[expense.category] || 0) + expense.amount;
    }

    // Find highest spending category
    let highestCategory = 'none';
    let highestAmount = 0;
    for (const [cat, amount] of Object.entries(categoryTotals)) {
      if (amount > highestAmount) {
        highestCategory = cat;
        highestAmount = amount;
      }
    }

    return {
      success: true,
      message: 'Expense summary retrieved successfully',
      data: {
        totalTripCost: Math.round(totalTripCost * 100) / 100,
        perPersonCost,
        memberCount,
        expenseCount: group.expenses.length,
        highestSpendingCategory: highestCategory,
        highestSpendingAmount: Math.round(highestAmount * 100) / 100,
        categories: categoryTotals,
      },
    };
  }

  // ─── CATEGORY ANALYTICS ────────────────────────────────────────────────

  async getCategoryAnalytics(userId: string, groupId: string) {
    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      include: { expenses: true },
    });

    if (!group) {
      throw new NotFoundException({
        success: false,
        message: 'Expense group not found',
      });
    }

    await this.verifyMembership(groupId, userId);

    const totalAmount = group.expenses.reduce((sum, e) => sum + e.amount, 0);

    // Category breakdown
    const categoryMap: Record<string, { total: number; count: number }> = {};
    for (const expense of group.expenses) {
      if (!categoryMap[expense.category]) {
        categoryMap[expense.category] = { total: 0, count: 0 };
      }
      categoryMap[expense.category].total += expense.amount;
      categoryMap[expense.category].count += 1;
    }

    const categories = Object.entries(categoryMap).map(([category, data]) => ({
      category,
      total: Math.round(data.total * 100) / 100,
      count: data.count,
      percentage: totalAmount > 0
        ? Math.round((data.total / totalAmount) * 10000) / 100
        : 0,
    }));

    // Sort by total descending
    categories.sort((a, b) => b.total - a.total);

    return {
      success: true,
      message: 'Category analytics retrieved successfully',
      data: {
        totalAmount: Math.round(totalAmount * 100) / 100,
        categories,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 8 — AI INSIGHTS
  // ═══════════════════════════════════════════════════════════════════════

  // ─── GET AI INSIGHTS ───────────────────────────────────────────────────

  async getAiInsights(userId: string, groupId: string) {
    this.logger.log(`Getting AI insights for group ${groupId}`);

    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      include: {
        trip: true,
        members: {
          include: { user: { select: { id: true, name: true } } },
        },
        expenses: {
          include: {
            paidBy: { select: { id: true, name: true } },
            splits: true,
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException({
        success: false,
        message: 'Expense group not found',
      });
    }

    await this.verifyMembership(groupId, userId);

    // Build category breakdown
    const categoryBreakdown: Record<string, number> = {};
    let totalSpent = 0;
    for (const expense of group.expenses) {
      categoryBreakdown[expense.category] =
        (categoryBreakdown[expense.category] || 0) + expense.amount;
      totalSpent += expense.amount;
    }

    // Calculate remaining days
    const now = new Date();
    const endDate = new Date(group.trip.endDate);
    const remainingDays = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    // Prepare payload for Python AI engine
    const aiPayload = {
      trip_summary: {
        source: group.trip.source,
        destination: group.trip.destination,
        start_date: group.trip.startDate,
        end_date: group.trip.endDate,
        trip_mood: group.trip.tripMood,
        member_count: group.members.length,
      },
      expenses: group.expenses.map((e) => ({
        title: e.title,
        amount: e.amount,
        category: e.category,
        paid_by: e.paidBy.name,
        date: e.createdAt,
      })),
      category_breakdown: categoryBreakdown,
      budget: group.trip.budget || 'not_specified',
      total_spent: Math.round(totalSpent * 100) / 100,
      remaining_days: remainingDays,
    };

    // Call Python AI engine
    const url = `${this.AI_BASE_URL}/expense-insights`;
    this.logger.log(`Calling AI engine: POST ${url}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, aiPayload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60_000, // 1 minute for insights
        }),
      );

      return {
        success: true,
        message: 'AI insights retrieved successfully',
        data: {
          insights: response.data.insights || response.data,
          tripContext: {
            destination: group.trip.destination,
            totalSpent: Math.round(totalSpent * 100) / 100,
            budget: group.trip.budget,
            remainingDays,
          },
        },
      };
    } catch (error) {
      this.handleAiError(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════

  // ─── VERIFY MEMBERSHIP ─────────────────────────────────────────────────

  private async verifyMembership(groupId: string, userId: string) {
    const member = await this.prisma.expenseMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException({
        success: false,
        message: 'You are not a member of this expense group',
      });
    }

    return member;
  }

  // ─── AI ERROR HANDLER ──────────────────────────────────────────────────

  private handleAiError(error: any): never {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      this.logger.error('AI engine timeout during expense insights');
      throw new HttpException(
        {
          success: false,
          message: 'AI service is taking too long. Please try again.',
          error: 'AI_TIMEOUT',
        },
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      this.logger.error('AI engine unreachable during expense insights');
      throw new HttpException(
        {
          success: false,
          message: 'AI service is currently unavailable. Please try again later.',
          error: 'AI_UNAVAILABLE',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (error.response) {
      const status = error.response.status || HttpStatus.BAD_GATEWAY;
      const aiMessage =
        error.response.data?.detail ||
        error.response.data?.message ||
        'AI engine returned an error';

      this.logger.error(`AI engine error: ${status} — ${aiMessage}`);
      throw new HttpException(
        {
          success: false,
          message: `AI service error: ${aiMessage}`,
          error: 'AI_ENGINE_ERROR',
        },
        status >= 500 ? HttpStatus.BAD_GATEWAY : status,
      );
    }

    this.logger.error(`Unexpected AI error: ${error.message}`);
    throw new HttpException(
      {
        success: false,
        message: 'An unexpected error occurred with the AI service.',
        error: 'AI_UNKNOWN_ERROR',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
