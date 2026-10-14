import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth-middleware';
import { SearchEmailsSchema } from '@reachinbox/shared';
import { SearchService } from './search-service';

export const searchRouter = Router();

searchRouter.use(requireAuth);

// GET /api/search/emails
searchRouter.get('/emails', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.id;
    const query = SearchEmailsSchema.parse(req.query);

    const results = await SearchService.searchEmails(tenantId, query);

    res.json({
      success: true,
      data: results.items,
      meta: {
        page: results.page,
        limit: results.limit,
        total: results.total,
        totalPages: results.totalPages,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});
