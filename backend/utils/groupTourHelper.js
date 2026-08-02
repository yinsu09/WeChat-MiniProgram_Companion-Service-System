const db = require('./db');
const Notification = require('../models/Notification');
const { getProviderUserId, notifyProviderNewOrder } = require('./notificationHelper');

const ASSIGN_NONE = 0;
const ASSIGN_PENDING = 1;
const ASSIGN_ACCEPTED = 2;
const ASSIGN_REJECTED = 3;

function isGroupActivityEnded(activity) {
  if (!activity) return false;
  if (Number(activity.group_success) === 1) return true;
  if (activity.valid_end) {
    const end = new Date(activity.valid_end);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (end < new Date()) return true;
    }
  }
  return false;
}

function resolveGroupActivityStatus(activity, currentPeople = 0) {
  const maxPeople = activity.total_count || 100;
  const now = new Date();
  if (isGroupActivityEnded(activity)) return 'completed';
  if (activity.valid_start && new Date(activity.valid_start) > now) return 'inactive';
  if (currentPeople >= maxPeople) return 'full';
  return 'active';
}

function getGroupLifecycleText(status, ended) {
  if (ended || status === 'completed') return '已结束';
  if (status === 'full') return '已满员';
  if (status === 'inactive') return '未开始';
  return '进行中';
}

async function syncEndedGroupOrders(activityId) {
  const result = await db.execute(
    `UPDATE orders SET status = 4, updated_at = NOW()
     WHERE group_activity_id = ? AND status IN (1, 2, 3)`,
    [activityId]
  );
  return result.affectedRows || 0;
}

async function syncAllEndedGroupActivities() {
  const rows = await db.query(
    `SELECT id FROM coupons WHERE type = 3
     AND (group_success = 1 OR (valid_end IS NOT NULL AND valid_end < NOW()))`
  );
  let total = 0;
  for (const row of rows) {
    total += await syncEndedGroupOrders(row.id);
  }
  return total;
}

async function assertGroupActivityEditable(activityId) {
  const activity = await getActivity(activityId);
  if (!activity) throw new Error('组团活动不存在');
  if (isGroupActivityEnded(activity)) {
    throw new Error('活动已结束，仅可查看');
  }
  return activity;
}

function buildLifecycleMeta(activity, currentPeople = 0) {
  const ended = isGroupActivityEnded(activity);
  const activity_status = resolveGroupActivityStatus(activity, currentPeople);
  return {
    activity_status,
    activity_ended: ended,
    viewOnly: ended,
    lifecycle_text: getGroupLifecycleText(activity_status, ended)
  };
}

async function getActivity(activityId) {
  const rows = await db.query('SELECT * FROM coupons WHERE id = ? AND type = 3 LIMIT 1', [activityId]);
  return rows[0] || null;
}

async function getProviderName(spId) {
  if (!spId) return '';
  const rows = await db.query(
    'SELECT nickname, real_name FROM service_providers WHERE id = ? LIMIT 1',
    [spId]
  );
  return rows[0]?.real_name || rows[0]?.nickname || '服务人员';
}

async function syncGroupOrdersProvider(activityId, providerId) {
  await db.execute(
    `UPDATE orders
     SET provider_id = ?, assign_type = ?
     WHERE group_activity_id = ? AND status IN (0, 1, 2, 3)`,
    [providerId || null, providerId ? 1 : 0, activityId]
  );

  const activity = await getActivity(activityId);
  if (activity) {
    await db.execute(
      'UPDATE services SET provider_id = ? WHERE name = ?',
      [providerId || null, `【组团】${activity.name}`]
    );
  }
}

function resolveAssignStatus(activity) {
  const status = Number(activity.provider_assign_status || 0);
  if (status === ASSIGN_PENDING && activity.pending_provider_id) {
    return {
      key: 'pending',
      status,
      provider_id: null,
      pending_provider_id: activity.pending_provider_id,
      provider_status_text: '待服务人员确认'
    };
  }
  if (status === ASSIGN_ACCEPTED && activity.provider_id) {
    return {
      key: 'accepted',
      status,
      provider_id: activity.provider_id,
      pending_provider_id: null,
      provider_status_text: '已确认'
    };
  }
  if (status === ASSIGN_REJECTED) {
    return {
      key: 'rejected',
      status,
      provider_id: null,
      pending_provider_id: null,
      provider_status_text: '暂无服务人员'
    };
  }
  return {
    key: 'none',
    status: ASSIGN_NONE,
    provider_id: activity.provider_id || null,
    pending_provider_id: null,
    provider_status_text: activity.provider_id ? '已确认' : '暂无服务人员'
  };
}

async function enrichGroupActivity(activity) {
  const assign = resolveAssignStatus(activity);
  const providerName = assign.provider_id ? await getProviderName(assign.provider_id) : '';
  const pendingName = assign.pending_provider_id ? await getProviderName(assign.pending_provider_id) : '';

  let provider_display = '暂无服务人员';
  if (assign.key === 'pending') {
    provider_display = `待「${pendingName}」确认`;
  } else if (assign.key === 'accepted' && providerName) {
    provider_display = providerName;
  }

  return {
    ...activity,
    provider_assign_status: assign.status,
    provider_status_key: assign.key,
    provider_status_text: assign.provider_status_text,
    provider_display,
    provider_name: providerName,
    pending_provider_name: pendingName,
    has_provider: assign.key === 'accepted' && !!assign.provider_id
  };
}

async function notifyProviderInvite(spId, activity) {
  const userId = await getProviderUserId(spId);
  if (!userId) return;
  await Notification.create({
    user_id: userId,
    title: '组团游带团邀请',
    content: `管理员邀请您担任「${activity.name}」的带团服务人员，请确认是否接受。`,
    type: 4,
    ref_type: 'group_invite',
    ref_id: activity.id
  });
}

async function notifyProviderInviteResult(spId, activity, accepted) {
  const userId = await getProviderUserId(spId);
  if (!userId) return;
  await Notification.create({
    user_id: userId,
    title: accepted ? '组团游邀请已接受' : '组团游邀请已拒绝',
    content: accepted
      ? `您已接受「${activity.name}」的带团邀请。`
      : `您已拒绝「${activity.name}」的带团邀请。`,
    type: 1,
    ref_type: 'group_tour',
    ref_id: activity.id
  });
}

async function inviteGroupProvider(activityId, providerId) {
  await assertGroupActivityEditable(activityId);
  const activity = await getActivity(activityId);
  if (!activity) {
    throw new Error('组团活动不存在');
  }
  if (!providerId) {
    throw new Error('请选择服务人员');
  }

  const providerRows = await db.query(
    'SELECT id, nickname, real_name, status FROM service_providers WHERE id = ? LIMIT 1',
    [providerId]
  );
  if (!providerRows.length || Number(providerRows[0].status) === 0) {
    throw new Error('服务人员不可用');
  }

  await db.execute(
    `UPDATE coupons
     SET pending_provider_id = ?, provider_assign_status = ?, provider_id = NULL
     WHERE id = ? AND type = 3`,
    [providerId, ASSIGN_PENDING, activityId]
  );
  await syncGroupOrdersProvider(activityId, null);
  await notifyProviderInvite(providerId, activity);
  return enrichGroupActivity(await getActivity(activityId));
}

async function acceptGroupProvider(activityId, spId) {
  await assertGroupActivityEditable(activityId);
  const activity = await getActivity(activityId);
  if (!activity) throw new Error('组团活动不存在');
  if (Number(activity.provider_assign_status) !== ASSIGN_PENDING) {
    throw new Error('当前没有待确认的邀请');
  }
  if (Number(activity.pending_provider_id) !== Number(spId)) {
    throw new Error('该邀请不是发给您的');
  }

  await db.execute(
    `UPDATE coupons
     SET provider_id = ?, provider_assign_status = ?, pending_provider_id = NULL
     WHERE id = ? AND type = 3`,
    [spId, ASSIGN_ACCEPTED, activityId]
  );
  await syncGroupOrdersProvider(activityId, spId);

  const updated = await getActivity(activityId);
  const pendingOrders = await db.query(
    'SELECT order_no FROM orders WHERE group_activity_id = ? AND status = 1',
    [activityId]
  );
  for (const order of pendingOrders) {
    await notifyProviderNewOrder(spId, order.order_no, updated.name);
  }

  await notifyProviderInviteResult(spId, updated, true);
  return enrichGroupActivity(updated);
}

async function rejectGroupProvider(activityId, spId) {
  await assertGroupActivityEditable(activityId);
  const activity = await getActivity(activityId);
  if (!activity) throw new Error('组团活动不存在');
  if (Number(activity.provider_assign_status) !== ASSIGN_PENDING) {
    throw new Error('当前没有待确认的邀请');
  }
  if (Number(activity.pending_provider_id) !== Number(spId)) {
    throw new Error('该邀请不是发给您的');
  }

  await db.execute(
    `UPDATE coupons
     SET provider_id = NULL, provider_assign_status = ?, pending_provider_id = NULL
     WHERE id = ? AND type = 3`,
    [ASSIGN_REJECTED, activityId]
  );
  await syncGroupOrdersProvider(activityId, null);

  const updated = await getActivity(activityId);
  await notifyProviderInviteResult(spId, updated, false);
  return enrichGroupActivity(updated);
}

async function exitGroupProvider(activityId, spId) {
  await assertGroupActivityEditable(activityId);
  const activity = await getActivity(activityId);
  if (!activity) throw new Error('组团活动不存在');
  if (Number(activity.provider_id) !== Number(spId)) {
    throw new Error('您不是该组团游的服务人员');
  }

  await db.execute(
    `UPDATE coupons
     SET provider_id = NULL, provider_assign_status = ?, pending_provider_id = NULL
     WHERE id = ? AND type = 3`,
    [ASSIGN_NONE, activityId]
  );
  await syncGroupOrdersProvider(activityId, null);
  return enrichGroupActivity(await getActivity(activityId));
}

async function getProviderGroupTours(spId) {
  await syncAllEndedGroupActivities();

  const rows = await db.query(
    `SELECT * FROM coupons
     WHERE type = 3
       AND (
         pending_provider_id = ?
         OR provider_id = ?
       )
     ORDER BY valid_start DESC`,
    [spId, spId]
  );

  const ongoing = [];
  const completed = [];

  await Promise.all(rows.map(async (activity) => {
    const peopleRows = await db.query(
      'SELECT COUNT(*) AS count FROM orders WHERE group_activity_id = ? AND status NOT IN (5, 7)',
      [activity.id]
    );
    const currentPeople = peopleRows[0]?.count || 0;
    const enriched = await enrichGroupActivity(activity);
    const lifecycle = buildLifecycleMeta(activity, currentPeople);
    const ended = lifecycle.activity_ended;

    const item = {
      id: enriched.id,
      name: enriched.name,
      description: enriched.description || '',
      location: enriched.location || '',
      valid_start: enriched.valid_start,
      valid_end: enriched.valid_end,
      price: parseFloat(enriched.discount_value) || 0,
      current_people: currentPeople,
      max_people: enriched.total_count || 100,
      min_people: parseInt(enriched.min_amount, 10) || 0,
      group_success: !!enriched.group_success,
      provider_assign_status: enriched.provider_assign_status,
      provider_status_key: enriched.provider_status_key,
      provider_status_text: enriched.provider_status_text,
      activity_status: lifecycle.activity_status,
      activity_ended: ended,
      lifecycle_text: lifecycle.lifecycle_text,
      viewOnly: ended,
      is_pending_for_me: Number(enriched.pending_provider_id) === Number(spId)
        && Number(enriched.provider_assign_status) === ASSIGN_PENDING,
      is_my_group: Number(enriched.provider_id) === Number(spId)
        && Number(enriched.provider_assign_status) === ASSIGN_ACCEPTED,
      can_accept: !ended
        && Number(enriched.pending_provider_id) === Number(spId)
        && Number(enriched.provider_assign_status) === ASSIGN_PENDING,
      can_reject: !ended
        && Number(enriched.pending_provider_id) === Number(spId)
        && Number(enriched.provider_assign_status) === ASSIGN_PENDING,
      can_exit: !ended
        && Number(enriched.provider_id) === Number(spId)
        && Number(enriched.provider_assign_status) === ASSIGN_ACCEPTED
    };

    if (ended) {
      completed.push(item);
    } else {
      ongoing.push(item);
    }
  }));

  return { ongoing, completed, all: [...ongoing, ...completed] };
}

module.exports = {
  ASSIGN_NONE,
  ASSIGN_PENDING,
  ASSIGN_ACCEPTED,
  ASSIGN_REJECTED,
  isGroupActivityEnded,
  resolveGroupActivityStatus,
  buildLifecycleMeta,
  syncEndedGroupOrders,
  syncAllEndedGroupActivities,
  assertGroupActivityEditable,
  getActivity,
  enrichGroupActivity,
  inviteGroupProvider,
  acceptGroupProvider,
  rejectGroupProvider,
  exitGroupProvider,
  getProviderGroupTours,
  syncGroupOrdersProvider
};
