# -*- coding: utf-8 -*-
"""使用 Word COM 将 PNG 图表插入课设说明书"""
import os
import win32com.client

BASE = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.dirname(BASE)
PNG_DIR = os.path.join(BASE, 'png')
SRC = os.path.join(DOCS_DIR, '学号_姓名_陪伴服务系统说明书.docx')
OUT = os.path.join(DOCS_DIR, '学号_姓名_陪伴服务系统说明书_含图.docx')

CAPTION_TO_FILE = [
    ('用例图', '00-用例图.png'),
    ('图1-1', '01-功能模块图.png'),
    ('图2-1', '02-整体业务流程图.png'),
    ('图2-2', '03-登录流程图.png'),
    ('图2-3', '04-服务浏览与查询流程图.png'),
    ('图2-4', '05-服务预约与下单流程图.png'),
    ('图2-5', '06-服务接单流程图.png'),
    ('图2-6', '07-订单管理与退款流程图.png'),
    ('图2-7', '08-评价与售后流程图.png'),
    ('图2-8', '09-服务人员管理流程图.png'),
    ('图2-9', '10-服务项目管理流程图.png'),
    ('图2-10', '11-数据统计分析流程图.png'),
    ('图2-11', '12-营销活动与消息通知流程图.png'),
    ('图2-12', '13-ER图.png'),
]

USECASE_NOTE = '（用例图必须有，使用专用工具绘制）'
USECASE_IMG = os.path.join(PNG_DIR, '00-用例图.png')


def insert_after_paragraph(doc, find_text, image_path, width_cm=15, partial=False):
    if not os.path.exists(image_path):
        print(f'  缺失: {image_path}')
        return False
    for i in range(1, doc.Paragraphs.Count + 1):
        para = doc.Paragraphs(i)
        text = para.Range.Text.strip()
        matched = (find_text in text) if partial else (text == find_text or find_text in text)
        if matched:
            rng = para.Range
            rng.Collapse(0)  # wdCollapseEnd
            rng.InsertParagraphAfter()
            new_para = doc.Paragraphs(i + 1)
            new_para.Range.Text = ''
            new_para.Alignment = 1  # center
            inline = new_para.Range.InlineShapes.AddPicture(image_path, False, True)
            inline.Width = width_cm * 28.35  # cm to points
            print(f'  已插入: {os.path.basename(image_path)}')
            return True
    print(f'  未找到段落: {find_text[:30]}')
    return False


def remove_placeholder_before_caption(doc, caption_key):
    for i in range(1, doc.Paragraphs.Count + 1):
        para = doc.Paragraphs(i)
        if caption_key in para.Range.Text:
            if i > 1:
                prev = doc.Paragraphs(i - 1)
                if '【此处插入' in prev.Range.Text:
                    prev.Range.Delete()
            return True
    return False


def main():
    if not os.path.exists(SRC):
        raise FileNotFoundError(f'请先运行 generate_db_report.py 生成 {SRC}')

    word = win32com.client.Dispatch('Word.Application')
    word.Visible = False
    doc = word.Documents.Open(SRC)
    inserted = 0

    print('插入用例图...')
    for key in ['用例图必须有', '管理员功能需求']:
        if insert_after_paragraph(doc, key, USECASE_IMG, 14, partial=True):
            inserted += 1
            break

    print('插入各章节图表...')
    for key, fname in CAPTION_TO_FILE:
        remove_placeholder_before_caption(doc, key)
        img = os.path.join(PNG_DIR, fname)
        if insert_after_paragraph(doc, key, img, 15):
            inserted += 1

    doc.SaveAs2(OUT)
    doc.Close(False)
    word.Quit()
    print(f'\n共插入 {inserted} 张图表')
    print(f'输出: {OUT}')
    print('图3-1~图3-13 界面截图需在微信开发者工具中手动截取后插入')


if __name__ == '__main__':
    main()
