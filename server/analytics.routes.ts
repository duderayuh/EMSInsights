import { Router } from 'express';
import { analyticsService } from './analytics.service';
import { requireAuth } from './middleware/auth-middleware';

const router = Router();

// Get public health summary
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const summary = await analyticsService.generateSummary(days);
    res.json(summary);
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// Get spike alerts
router.get('/spikes', requireAuth, async (req, res) => {
  try {
    const spikes = await analyticsService.detectSpikes();
    res.json(spikes);
  } catch (error) {
    console.error('Error detecting spikes:', error);
    res.status(500).json({ error: 'Failed to detect spikes' });
  }
});

// Get geographic clusters
router.get('/geoclusters', requireAuth, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const clusters = await analyticsService.getGeoClusters(hours);
    res.json(clusters);
  } catch (error) {
    console.error('Error getting geoclusters:', error);
    res.status(500).json({ error: 'Failed to get geoclusters' });
  }
});

// Get AI insights
router.get('/ai-insight', requireAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const summary = await analyticsService.generateSummary(days);
    const insight = await analyticsService.generateAIInsight(summary);
    res.json({ insight, summary });
  } catch (error) {
    console.error('Error generating AI insight:', error);
    res.status(500).json({ error: 'Failed to generate AI insight' });
  }
});

// Get chief complaint trends
router.get('/trends', requireAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const trends = await analyticsService.getChiefComplaintTrends(days);
    res.json(trends);
  } catch (error) {
    console.error('Error getting trends:', error);
    res.status(500).json({ error: 'Failed to get trends' });
  }
});

export const analyticsRoutes = router;