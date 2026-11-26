import { Body, Controller, Headers, Patch } from '@nestjs/common';
import { UserApprovalService } from './user-approval.service.js';

@Controller('internal/users')
export class UserApprovalController {
  constructor(private readonly approvals: UserApprovalService) {}

  @Patch('approval')
  setApproval(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.approvals.setApproval(authorization, body);
  }
}
