# -*- coding: utf-8 -*-
"""批量渲染报告所需 PlantUML 图表为 PNG"""
import glob
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
JAR = os.path.join(BASE, 'plantuml.jar')
PLANTUML_DIR = os.path.join(BASE, 'plantuml')
PNG_DIR = os.path.join(BASE, 'png')

FIGURE_MAP = [
    ('00-用例图.png', '用例图（第1章 1.1）'),
    ('01-功能模块图.png', '图1-1 陪伴服务系统功能模块图'),
    ('02-整体业务流程图.png', '图2-1 系统整体业务流程图'),
    ('03-登录流程图.png', '图2-2 登录流程图'),
    ('04-服务浏览与查询流程图.png', '图2-3 服务浏览与查询流程图'),
    ('05-服务预约与下单流程图.png', '图2-4 服务预约与下单流程图'),
    ('06-服务接单流程图.png', '图2-5 服务接单流程图'),
    ('07-订单管理与退款流程图.png', '图2-6 订单管理与退款流程图'),
    ('08-评价与售后流程图.png', '图2-7 评价与售后流程图'),
    ('09-服务人员管理流程图.png', '图2-8 服务人员管理流程图'),
    ('10-服务项目管理流程图.png', '图2-9 服务项目管理流程图'),
    ('11-数据统计分析流程图.png', '图2-10 数据统计分析流程图'),
    ('12-营销活动与消息通知流程图.png', '图2-11 营销活动与消息通知流程图'),
    ('13-ER图.png', '图2-12 陪伴服务系统 E-R 图'),
]


def ensure_jar():
    if os.path.exists(JAR):
        return
    import urllib.request
    url = 'https://github.com/plantuml/plantuml/releases/download/v1.2024.8/plantuml-1.2024.8.jar'
    print('下载 PlantUML ...')
    urllib.request.urlretrieve(url, JAR)


def render_all():
    os.makedirs(PNG_DIR, exist_ok=True)
    files = sorted(
        p for p in glob.glob(os.path.join(PLANTUML_DIR, '*.puml'))
        if not os.path.basename(p).startswith('test')
    )
    if not files:
        print('未找到 .puml 源文件')
        sys.exit(1)

    for path in files:
        cmd = [
            'java', '-jar', JAR,
            '-charset', 'UTF-8',
            '-tpng',
            '-o', PNG_DIR,
            os.path.abspath(path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
        name = os.path.basename(path)
        if result.returncode != 0:
            print(f'[失败] {name}')
            if result.stderr:
                print(result.stderr.strip())
        else:
            print(f'[成功] {name}')

    print('\n生成结果:')
    ok = 0
    for fname, caption in FIGURE_MAP:
        path = os.path.join(PNG_DIR, fname)
        exists = os.path.exists(path)
        if exists:
            ok += 1
        status = 'OK' if exists else '缺失'
        print(f'  [{status}] {fname}  ->  {caption}')
    print(f'\n共 {ok}/{len(FIGURE_MAP)} 张图表')


if __name__ == '__main__':
    ensure_jar()
    render_all()
