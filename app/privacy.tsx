import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { TopBar } from '@/components/TopBar';
import { GlassSurface } from '@/components/GlassSurface';
import { useAppTheme, typography } from '@/constants/theme';
import { APP_VERSION } from '@/constants/app';

const sections = [
  ['处理位置', '图序在设备本地建立照片索引、规则分类、基础评分和视觉指纹。当前版本不包含账号、广告或分析 SDK。'],
  ['照片权限', '照片权限只用于读取你允许访问的照片，并在你明确确认后调用系统删除界面。选择“部分照片”时，图序只索引这些照片，你可以随时在系统设置中调整。'],
  ['本地数据', '索引包含照片标识、文件名、尺寸、拍摄时间、分类、整理状态、视觉指纹，以及本机或你主动识别的图片文字，保存在应用的 SQLite 数据库中。清空应用数据或卸载应用会移除这些索引。'],
  ['删除规则', '移入图序回收站不会删除系统照片。只有点击“永久删除”并通过系统确认后，图序才会请求删除；失败或未确认的照片会继续保留在回收站。'],
  ['可选 AI 功能', '云端识字、照片理解和相似照片比较都需你逐次确认，确认后才会向配置的 AI 接口发送压缩图；AI 搜索扩展和连接测试只发送文字。识别文字与照片理解描述保存在本地索引，可用于搜索；只有点击“采用分类”才会更新本地照片分类。服务提供方可能收费并按其条款处理请求。API Key 保存在设备安全存储中。'],
  ['本地处理与网络', '常规索引、规则分类、基础评分、视觉指纹、截图与文档文字识别、搜索匹配和整理都在本机处理。本机文字识别可以在分析状态页暂停。云端 AI 不会后台读取或上传照片；只有你主动确认对应操作时才会发送所需内容。系统和应用商店可能独立处理崩溃诊断、下载与更新数据，具体取决于你的设备设置和分发渠道。'],
  ['你的选择', '你可以撤销照片权限、改为部分照片访问、清空本地索引，或卸载图序。撤销权限不会删除系统照片。']
] as const;

export default function PrivacyScreen() {
  const theme = useAppTheme();
  return <Screen header={<TopBar title="隐私说明" subtitle={`图序 ${APP_VERSION}`} back />}><GlassSurface intensity={30} style={[styles.card, { borderColor: theme.border }]}>{sections.map(([title, body], index) => <View key={title} style={[styles.section, { borderBottomColor: theme.border }, index === sections.length - 1 && styles.last]}><Text style={[styles.title, { color: theme.text }]}>{title}</Text><Text style={[styles.body, { color: theme.muted }]}>{body}</Text></View>)}</GlassSurface><Text style={[styles.updated, { color: theme.tertiary }]}>更新日期：2026 年 9 月 27 日</Text></Screen>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 15 },
  section: { paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  last: { borderBottomWidth: 0 },
  title: { ...typography.callout },
  body: { ...typography.footnote, marginTop: 6, lineHeight: 21 },
  updated: { ...typography.caption, textAlign: 'center', marginTop: 14 }
});
