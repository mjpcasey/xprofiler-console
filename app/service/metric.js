'use strict';

const pMap = require('p-map');
const moment = require('moment');
const Service = require('egg').Service;

class MetricService extends Service {
  async getDataByPeriod(appId, agentId, tablePrefix, period, pid) {
    const { ctx, ctx: { app, service: { mysql } } } = this;

    const periods = app.getPeriods(period);
    let list = await pMap(periods, async ({ date, start, end }) => {
      let data;
      try {
        data = await mysql.getXnppLogs(`${tablePrefix}${date}`, appId, agentId, start, end, pid);
      } catch (err) {
        ctx.logger.error(`getDataByPeriod failed: ${err}`);
      }
      return data;
    }, { concurrency: 2 });

    list = list
      .reverse()
      .filter(item => item)
      .reduce((list, item) => (list = list.concat(item)), []);

    return list;
  }

  handleTrends(trends, keys, duration) {
    if (!trends.length || !keys.length) {
      return [];
    }

    const formatter = 'YYYY-MM-DD HH:mm';
    const count = 720;

    // const end = new Date(trends[0].log_time).getTime();
    const end = Date.now();
    const start = end - duration * 60 * 60 * 1000;
    const interval = duration * 60 / count * 60 * 1000;

    const trendMap = {};
    for (const trend of trends) {
      const time = moment(trend.log_time).format(formatter);
      trendMap[time] = trend;
    }
    const validInterval = 60 * 1000;
    for (let time = start; time < end; time += 60 * 1000) {
      const timeKey = moment(time).format(formatter);
      if (trendMap[timeKey]) {
        continue;
      }
      const timeKeyBefore = moment(time - validInterval).format(formatter);
      const timeKeyAfter = moment(time + validInterval).format(formatter);
      if (trendMap[timeKeyBefore] && trendMap[timeKeyAfter]) {
        trendMap[timeKey] = trendMap[timeKeyAfter];
      }
    }

    const results = [];
    for (let time = start; time < end; time += interval) {
      const data = { time };
      const timeKey = moment(time).format(formatter);
      const trend = trendMap[timeKey];
      if (trend) {
        keys.forEach(keyObj => {
          if (typeof keyObj === 'string') {
            data[keyObj] = trend[keyObj];
          } else {
            const { key, label, handle } = keyObj;
            const showLabel = label || key;
            if (typeof handle === 'function') {
              data[showLabel] = handle(trend[key]);
            } else {
              data[showLabel] = trend[key];
            }
          }
        });
      }
      results.push(data);
    }

    return results;
  }
}

module.exports = MetricService;
