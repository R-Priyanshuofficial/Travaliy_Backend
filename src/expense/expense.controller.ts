import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExpenseService } from './expense.service';
import {
  CreateExpenseGroupDto,
  AddMemberDto,
  AddExpenseDto,
  SettleExpenseDto,
} from './dto';

@ApiTags('Expense')
@ApiBearerAuth()
@Controller('expense')
@UseGuards(JwtAuthGuard)
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  // ═══════════════════════════════════════════════════════════════════════
  // EXPENSE GROUP APIs
  // ═══════════════════════════════════════════════════════════════════════

  // ─── API 1: CREATE EXPENSE GROUP ───────────────────────────────────────

  @Post('group/create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an expense group for a trip' })
  @ApiResponse({ status: 201, description: 'Expense group created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  @ApiResponse({ status: 409, description: 'Expense group already exists for this trip' })
  async createGroup(@Req() req: any, @Body() dto: CreateExpenseGroupDto) {
    return this.expenseService.createGroup(req.user.id, dto);
  }

  // ─── API 2: GET EXPENSE GROUP ──────────────────────────────────────────

  @Get('group/:tripId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get expense group by trip ID' })
  @ApiParam({ name: 'tripId', description: 'Trip ID' })
  @ApiResponse({ status: 200, description: 'Expense group retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'No expense group found for this trip' })
  async getGroup(@Req() req: any, @Param('tripId') tripId: string) {
    return this.expenseService.getGroup(req.user.id, tripId);
  }

  // ─── API 3: ADD MEMBER ─────────────────────────────────────────────────

  @Post('group/add-member')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a member to an expense group' })
  @ApiResponse({ status: 201, description: 'Member added successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Group or user not found' })
  @ApiResponse({ status: 409, description: 'User already a member' })
  async addMember(@Req() req: any, @Body() dto: AddMemberDto) {
    return this.expenseService.addMember(req.user.id, dto);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXPENSE APIs
  // ═══════════════════════════════════════════════════════════════════════

  // ─── API 4: ADD EXPENSE ────────────────────────────────────────────────

  @Post('add')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an expense with equal split' })
  @ApiResponse({ status: 201, description: 'Expense added successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Invalid expense data' })
  @ApiResponse({ status: 404, description: 'Expense group not found' })
  async addExpense(@Req() req: any, @Body() dto: AddExpenseDto) {
    return this.expenseService.addExpense(req.user.id, dto);
  }

  // ─── API 9: EXPENSE SUMMARY (placed before :groupId to avoid conflict) ─

  @Get('summary/:groupId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get expense summary and analytics for a group' })
  @ApiParam({ name: 'groupId', description: 'Expense Group ID' })
  @ApiResponse({ status: 200, description: 'Expense summary retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Expense group not found' })
  async getSummary(@Req() req: any, @Param('groupId') groupId: string) {
    return this.expenseService.getSummary(req.user.id, groupId);
  }

  // ─── API 10: CATEGORY ANALYTICS ────────────────────────────────────────

  @Get('categories/:groupId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get category-wise spending breakdown' })
  @ApiParam({ name: 'groupId', description: 'Expense Group ID' })
  @ApiResponse({ status: 200, description: 'Category analytics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Expense group not found' })
  async getCategoryAnalytics(@Req() req: any, @Param('groupId') groupId: string) {
    return this.expenseService.getCategoryAnalytics(req.user.id, groupId);
  }

  // ─── API 7: GET BALANCES ───────────────────────────────────────────────

  @Get('balances/:groupId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get balance sheet with simplified debts' })
  @ApiParam({ name: 'groupId', description: 'Expense Group ID' })
  @ApiResponse({ status: 200, description: 'Balances calculated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Expense group not found' })
  async getBalances(@Req() req: any, @Param('groupId') groupId: string) {
    return this.expenseService.getBalances(req.user.id, groupId);
  }

  // ─── API 11: AI INSIGHTS ──────────────────────────────────────────────

  @Get('ai-insights/:groupId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get AI-powered financial insights for expenses' })
  @ApiParam({ name: 'groupId', description: 'Expense Group ID' })
  @ApiResponse({ status: 200, description: 'AI insights retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Expense group not found' })
  @ApiResponse({ status: 502, description: 'AI engine error' })
  @ApiResponse({ status: 504, description: 'AI engine timeout' })
  async getAiInsights(@Req() req: any, @Param('groupId') groupId: string) {
    return this.expenseService.getAiInsights(req.user.id, groupId);
  }

  // ─── API 5: GET GROUP EXPENSES ─────────────────────────────────────────

  @Get(':groupId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all expenses for a group' })
  @ApiParam({ name: 'groupId', description: 'Expense Group ID' })
  @ApiResponse({ status: 200, description: 'Expenses retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Expense group not found' })
  async getGroupExpenses(@Req() req: any, @Param('groupId') groupId: string) {
    return this.expenseService.getGroupExpenses(req.user.id, groupId);
  }

  // ─── API 6: DELETE EXPENSE ─────────────────────────────────────────────

  @Delete(':expenseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an expense and its splits' })
  @ApiParam({ name: 'expenseId', description: 'Expense ID' })
  @ApiResponse({ status: 200, description: 'Expense deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a member of this group' })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  async deleteExpense(@Req() req: any, @Param('expenseId') expenseId: string) {
    return this.expenseService.deleteExpense(req.user.id, expenseId);
  }

  // ─── API 8: SETTLE PAYMENT ─────────────────────────────────────────────

  @Post('settle')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a settlement payment between users' })
  @ApiResponse({ status: 201, description: 'Settlement recorded successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Invalid settlement data' })
  @ApiResponse({ status: 404, description: 'Expense group not found' })
  async settlePayment(@Req() req: any, @Body() dto: SettleExpenseDto) {
    return this.expenseService.settlePayment(req.user.id, dto);
  }
}
