import { trustHtml } from '@/utils/trust/trustStore';
import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  DatePicker,
  Select,
  Table,
  Button,
  Space,
  Progress,
  Tag,
  Divider,
  Empty,
  Spin,
  message,
  Tooltip,
  Modal,
  Input,
  Collapse
} from 'antd';
import {
  DownloadOutlined,
  PrinterOutlined,
  FilterOutlined,
  EyeOutlined,
  DollarOutlined,
  TransactionOutlined,
  CalendarOutlined,
  BarChartOutlined,
  PieChartOutlined,
  LineChartOutlined,
  HistoryOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  ShareAltOutlined,
  InfoCircleOutlined,
  RiseOutlined,
  FallOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { collection, getDocs, query, where } from 'firebase/firestore';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Panel } = Collapse;
const { Search } = Input;

const ExpenseReport = ({ expenses, categories }) => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [reportData, setReportData] = useState([]);
  const [summary, setSummary] = useState({
    totalAmount: 0,
    totalExpenses: 0,
    averageExpense: 0,
    highestExpense: 0,
    lowestExpense: 0,
    dailyAverage: 0
  });
  const [categoryStats, setCategoryStats] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);

  // Load report data
  useEffect(() => {
    loadReportData();
  }, [expenses, dateRange, selectedCategory]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      let filteredExpenses = [...expenses];

      // Date filter
      if (dateRange && dateRange.length === 2) {
        const [start, end] = dateRange;
        filteredExpenses = filteredExpenses.filter(expense => {
          const expenseDate = dayjs(expense.date);
          return expenseDate.isAfter(start) && expenseDate.isBefore(end);
        });
      }

      // Category filter
      if (selectedCategory !== 'all') {
        filteredExpenses = filteredExpenses.filter(expense => expense.category === selectedCategory);
      }

      // Calculate summary
      const totalAmount = filteredExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
      const totalExpenses = filteredExpenses.length;
      const averageExpense = totalExpenses > 0 ? totalAmount / totalExpenses : 0;
      const highestExpense = Math.max(...filteredExpenses.map(exp => parseFloat(exp.amount || 0)), 0);
      const lowestExpense = Math.min(...filteredExpenses.map(exp => parseFloat(exp.amount || 0)), Infinity) || 0;
      
      // Days in range
      const daysInRange = dateRange && dateRange.length === 2 
        ? dateRange[1].diff(dateRange[0], 'day') + 1
        : 30;
      const dailyAverage = totalAmount / daysInRange;

      setSummary({
        totalAmount,
        totalExpenses,
        averageExpense,
        highestExpense,
        lowestExpense,
        dailyAverage
      });

      // Calculate category stats
      const categoryMap = {};
      filteredExpenses.forEach(expense => {
        const categoryId = expense.category;
        if (!categoryMap[categoryId]) {
          categoryMap[categoryId] = {
            amount: 0,
            count: 0,
            category: categories.find(c => c.id === categoryId) || {}
          };
        }
        categoryMap[categoryId].amount += parseFloat(expense.amount || 0);
        categoryMap[categoryId].count++;
      });

      const categoryStatsArray = Object.values(categoryMap).map(stat => ({
        ...stat,
        percentage: (stat.amount / totalAmount) * 100
      })).sort((a, b) => b.amount - a.amount);

      setCategoryStats(categoryStatsArray);

      // Daily stats
      const dailyMap = {};
      filteredExpenses.forEach(expense => {
        const date = dayjs(expense.date).format('YYYY-MM-DD');
        if (!dailyMap[date]) {
          dailyMap[date] = {
            date,
            amount: 0,
            count: 0
          };
        }
        dailyMap[date].amount += parseFloat(expense.amount || 0);
        dailyMap[date].count++;
      });

      const dailyArray = Object.values(dailyMap)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      setDailyStats(dailyArray);

      // Monthly trend (last 6 months)
      const monthlyMap = {};
      const sixMonthsAgo = dayjs().subtract(6, 'month');
      
      filteredExpenses.forEach(expense => {
        const monthKey = dayjs(expense.date).format('YYYY-MM');
        const monthDate = dayjs(expense.date);
        
        if (monthDate.isAfter(sixMonthsAgo)) {
          if (!monthlyMap[monthKey]) {
            monthlyMap[monthKey] = {
              month: monthKey,
              amount: 0,
              count: 0
            };
          }
          monthlyMap[monthKey].amount += parseFloat(expense.amount || 0);
          monthlyMap[monthKey].count++;
        }
      });

      // Fill missing months
      const monthlyArray = [];
      for (let i = 5; i >= 0; i--) {
        const month = dayjs().subtract(i, 'month').format('YYYY-MM');
        monthlyArray.push(monthlyMap[month] || {
          month,
          amount: 0,
          count: 0
        });
      }
      setMonthlyTrend(monthlyArray);

      setReportData(filteredExpenses);
    } catch (error) {
      console.error('Error loading report:', error);
      message.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  // Export functions
  const exportToCSV = () => {
    const headers = ['Date', 'Title', 'Category', 'Amount', 'Voucher No', 'Description'];
    const csvData = reportData.map(expense => [
      dayjs(expense.date).format('DD/MM/YYYY'),
      expense.title,
      categories.find(c => c.id === expense.category)?.name || expense.category,
      `₹${parseFloat(expense.amount).toFixed(2)}`,
      expense.voucherNo || 'N/A',
      expense.description || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense_report_${dayjs().format('YYYYMMDD')}.csv`;
    a.click();
    
    message.success('Report exported to CSV');
  };

  const printReport = () => {
    const printWindow = window.open('', '_blank')
    const categoryName = (id) => categories.find(c => c.id === id)?.name || id
    const grandTotal = reportData.reduce((s, e) => s + parseFloat(e.amount || 0), 0)
    const rows = reportData.map((exp, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="c date">${dayjs(exp.date).format('DD/MM/YYYY')}</td>
        <td class="l"><b>${exp.title}</b>${exp.description ? `<div class="sub">${exp.description}</div>` : ''}</td>
        <td class="c cat">${categoryName(exp.category)}</td>
        <td class="amt">₹${parseFloat(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="c mono vouch">${exp.voucherNo || '-'}</td>
      </tr>`).join('')

    printWindow.document.write(`<!DOCTYPE html><html lang="hi"><head>
<meta charset="utf-8">
<title>Expense Report — ${trustHtml().shortName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Serif+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 6mm 5mm 18mm 5mm; @bottom-center { content: "Page " counter(page); font-size: 10px; color: #6b7280; font-family: 'Noto Sans Devanagari', sans-serif; } }
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Noto Sans Devanagari',sans-serif;background:#fff;color:#1f2937;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0;font-size:13px}

  .top-border{height:5px;background:linear-gradient(90deg,${trustHtml().pdfColorPrimary},${trustHtml().pdfColorAccent},${trustHtml().pdfColorPrimary});margin-bottom:12px;border-radius:2px}

  .bless{display:flex;justify-content:space-between;padding:0 10px;margin-bottom:10px;border-bottom:1px dashed #d1d5db;padding-bottom:8px}
  .bless span{font-size:12px;color:${trustHtml().pdfColorAccent};font-weight:700;font-family:'Noto Serif Devanagari',serif;letter-spacing:.6px}

  .hdr{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:8px;padding:0 4px}
  .logo-box{width:78px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .logo-fb{width:65px;height:58px;border-radius:6px;background:linear-gradient(135deg,#E8EFF7,#d0dcec);border:2px solid #b5c5d8;display:flex;align-items:center;justify-content:center;font-size:10px;color:${trustHtml().pdfColorPrimary};font-weight:700;text-align:center;line-height:1.3;font-family:'Noto Serif Devanagari',serif}
  .logo-fb2{background:linear-gradient(135deg,#f5ece0,#ede0cc)!important;border-color:#c9a87a!important;color:#7a4a1e!important}
  .logo{width:65px;height:58px;border-radius:6px;object-fit:contain}
  .center-block{flex:1;text-align:center;padding:0 10px}
  .org-title{font-size:22px;font-weight:700;color:${trustHtml().pdfColorPrimary};font-family:'Noto Serif Devanagari',serif;letter-spacing:.5px;line-height:1.35;text-shadow:0 1px 1px rgba(0,0,0,.05)}
  .org-sub{font-size:16px;font-weight:700;color:${trustHtml().pdfColorPrimary};margin-bottom:3px}
  .org-addr{font-size:12px;color:#374151;line-height:1.6;margin-bottom:2px}
  .org-contact{font-size:12px;color:#374151;line-height:1.6}
  .org-contact .blue{color:${trustHtml().pdfColorPrimary};font-weight:700}

  .divider{height:2px;background:linear-gradient(90deg,transparent,${trustHtml().pdfColorPrimary},transparent);margin:8px 0}

  .title-area{text-align:center;margin:12px 0}
  .title-area .title{display:inline-block;background:linear-gradient(135deg,${trustHtml().pdfColorPrimary},#2a5a8a);color:#fff;padding:8px 44px;font-size:17px;font-weight:700;font-family:'Noto Serif Devanagari',serif;letter-spacing:.8px;box-shadow:0 3px 10px rgba(27,56,90,.3);position:relative}
  .title-area .title::before{content:'';position:absolute;top:-4px;left:-4px;right:-4px;bottom:-4px;border:2px solid ${trustHtml().pdfColorAccent};border-radius:10px;pointer-events:none}
  .title-area .title-inner{position:relative;z-index:1}

  .report-meta{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:linear-gradient(135deg,#f8fafc,#f1f5f9);border:1px solid #e2e8f0;border-radius:5px;margin-bottom:10px}
  .report-meta .meta-item{display:flex;align-items:center;gap:8px;font-size:12px;color:#475569}
  .report-meta .meta-item .label{font-weight:600;color:${trustHtml().pdfColorPrimary};font-size:12px}
  .report-meta .meta-item .badge{background:${trustHtml().pdfColorAccent};color:#fff;padding:2px 10px;border-radius:3px;font-size:11px;font-weight:600}

  .summary-cards{display:flex;gap:8px;margin-bottom:10px}
  .summary-cards .scard{flex:1;padding:9px 10px;border-radius:5px;text-align:center}
  .scard-total{background:linear-gradient(135deg,${trustHtml().pdfColorPrimary},#2a5a8a);color:#fff}
  .scard-count{background:linear-gradient(135deg,${trustHtml().pdfColorAccent},#e04a4f);color:#fff}
  .scard-avg{background:linear-gradient(135deg,#047857,#059669);color:#fff}
  .scard-high{background:linear-gradient(135deg,#b45309,#d97706);color:#fff}
  .scard .sval{font-size:17px;font-weight:700;line-height:1.3}
  .scard .slbl{font-size:10px;opacity:.9;letter-spacing:.4px}

  table{width:100%;border-collapse:collapse;font-size:12px;border:2px solid #cbd5e1;border-radius:4px;overflow:hidden}
  thead th{background:linear-gradient(180deg,${trustHtml().pdfColorPrimary},#15304e);color:#fff;padding:7px 6px;border:0.5px solid #2a4a6a;text-align:center;font-size:12px;font-weight:700;letter-spacing:.4px;font-family:'Noto Serif Devanagari',serif;white-space:nowrap}
  tbody td{padding:6px 6px;border:0.5px solid #e2e8f0;vertical-align:middle}
  tbody tr:nth-child(even){background:#f8fafc}
  td.c{text-align:center}
  td.l{text-align:left;padding-left:8px;word-break:break-word}
  td.amt{text-align:right;font-weight:700;font-size:13px;padding-right:8px;font-family:'Noto Sans Devanagari',sans-serif}
  td.mono{font-family:'Courier New',monospace;font-size:12px;letter-spacing:.3px}
  td.date{font-weight:600;color:#475569}
  td.cat{font-weight:600;color:${trustHtml().pdfColorPrimary}}
  td.vouch{color:#6b7280}
  .sub{font-size:10px;color:#6b7280;margin-top:2px}

  .totals-section{border:2px solid #cbd5e1;border-radius:5px;margin-top:10px;overflow:hidden}
  .totals-header{background:linear-gradient(90deg,${trustHtml().pdfColorPrimary},#2a5a8a);color:#fff;padding:6px 14px;font-size:12px;font-weight:700;letter-spacing:.5px}
  .totals-body{display:flex;padding:0}
  .totals-body .tb-item{flex:1;padding:8px 10px;text-align:center;border-right:0.5px solid #e2e8f0}
  .totals-body .tb-item:last-child{border-right:none}
  .tb-item .tbl{font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px}
  .tb-item .tbv{font-size:14px;font-weight:700;color:${trustHtml().pdfColorPrimary};margin-top:2px}
  .tb-item.highlight .tbv{color:${trustHtml().pdfColorAccent}}

  .signature-area{display:flex;justify-content:space-between;margin-top:18px;padding:0 14px}
  .signature-area .sig-item{text-align:center;min-width:180px}
  .sig-line{width:180px;height:0;border-top:1.5px dashed #9ca3af;margin:30px 0 5px}
  .sig-label{font-size:11px;color:#6b7280;letter-spacing:.4px;font-weight:500}

  .footer-bar{text-align:center;margin-top:12px;padding:8px 0;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af}

  @media print{body{background:#fff}}
</style></head><body>

<div class="top-border"></div>

<div class="bless">
  ${trustHtml().blessingsHtml}
</div>

<div class="hdr">
  <div class="logo-box"><img src="${trustHtml().logoSrc}" class="logo" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt=""><div class="logo-fb">${trustHtml().logoFallbackHtml}</div></div>
  <div class="center-block">
    <div class="org-title">${trustHtml().name}</div>
    <div class="org-sub">${trustHtml().cityLine}</div>
    <div class="org-addr"><b>हेड ऑफिस :</b> ${trustHtml().addressWithOffice}</div>
    <div class="org-contact"><b>संपर्क सूत्र :</b> <span class="blue">${trustHtml().presidentName}</span> &nbsp;|&nbsp; <span class="blue">${trustHtml().presidentPhone}</span> &nbsp;|&nbsp; <b>ऑफिस :</b> <span class="blue">${trustHtml().officePhone}</span></div>
  </div>
   <div class="logo-box"><img src="${trustHtml().rightImageSrc}" class="logo" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt=""><div class="logo-fb logo-fb2">शनि<br>देव</div></div>
</div>

<div class="divider"></div>

<div class="title-area">
  <div class="title"><span class="title-inner">खर्च रिपोर्ट</span></div>
</div>

<div class="report-meta">
  <div class="meta-item"><span class="label">अवधि :</span> ${dateRange[0]?.format('DD MMM YYYY')} - ${dateRange[1]?.format('DD MMM YYYY')}</div>
  <div class="meta-item"><span class="label">श्रेणी :</span> ${selectedCategory !== 'all' ? categoryName(selectedCategory) : 'सभी श्रेणियाँ'}</div>
  <div class="meta-item"><span class="label">कुल प्रविष्टियाँ :</span> <span class="badge">${reportData.length}</span></div>
</div>

<div class="summary-cards">
  <div class="scard scard-total"><div class="sval">₹${summary.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div><div class="slbl">कुल खर्च</div></div>
  <div class="scard scard-count"><div class="sval">${reportData.length}</div><div class="slbl">कुल प्रविष्टियाँ</div></div>
  <div class="scard scard-avg"><div class="sval">₹${summary.averageExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div><div class="slbl">औसत खर्च</div></div>
  <div class="scard scard-high"><div class="sval">₹${summary.highestExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div><div class="slbl">सर्वाधिक खर्च</div></div>
</div>

<table>
  <thead><tr>
    <th style="width:22px">#</th>
    <th style="width:68px">दिनांक</th>
    <th>शीर्षक / विवरण</th>
    <th style="width:76px">श्रेणी</th>
    <th style="width:72px">राशि (₹)</th>
    <th style="width:64px">वाउचर</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="totals-section">
  <div class="totals-header">सारांश (Summary)</div>
  <div class="totals-body">
    <div class="tb-item highlight"><div class="tbl">कुल खर्च</div><div class="tbv">₹${summary.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
    <div class="tb-item"><div class="tbl">औसत खर्च</div><div class="tbv">₹${summary.averageExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
    <div class="tb-item"><div class="tbl">सर्वाधिक</div><div class="tbv">₹${summary.highestExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
    <div class="tb-item"><div class="tbl">न्यूनतम</div><div class="tbv">₹${summary.lowestExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
    <div class="tb-item"><div class="tbl">दैनिक औसत</div><div class="tbv">₹${summary.dailyAverage.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
  </div>
</div>

<div class="signature-area">
  <div class="sig-item"><div class="sig-line"></div><div class="sig-label">लेखाकार (Accountant)</div></div>
  <div class="sig-item"><div class="sig-line"></div><div class="sig-label">कोषाध्यक्ष (Treasurer)</div></div>
  <div class="sig-item"><div class="sig-line"></div><div class="sig-label">अध्यक्ष (Chairman)</div></div>
</div>

<div class="footer-bar">
  Generated by ${trustHtml().shortName} • ${new Date().toLocaleString('en-IN')} • This is a computer-generated report
</div>

<script>
  (function(){var p=document.querySelectorAll('.logo');p.forEach(function(i){if(i.naturalWidth===0){i.style.display='none';var fb=i.nextElementSibling;if(fb)fb.style.display='flex'}});
  setTimeout(function(){window.print()},400)})();
</script>
</body></html>`)
    printWindow.document.close()
  };

  const shareReport = () => {
    Modal.info({
      title: 'Share Report',
      content: (
        <div className="space-y-3">
          <p>Share this report via:</p>
          <Space>
            <Button>Email</Button>
            <Button>Link</Button>
            <Button>PDF</Button>
          </Space>
        </div>
      )
    });
  };

  // Table columns
  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date) => dayjs(date).format('DD MMM YY'),
      sorter: (a, b) => new Date(a.date) - new Date(b.date)
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title'
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (categoryId) => {
        const category = categories.find(c => c.id === categoryId);
        return category ? (
          <Tag color={'#000'}>
            {category.icon} {category.name}
          </Tag>
        ) : '-';
      }
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (amount) => (
        <span className="font-bold text-gray-900">
          ₹{parseFloat(amount).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}
        </span>
      ),
      sorter: (a, b) => parseFloat(a.amount) - parseFloat(b.amount)
    },
    {
      title: 'Voucher',
      dataIndex: 'voucherNo',
      key: 'voucherNo',
      render: (voucher) => (
        <span className="text-blue-600 font-mono">{voucher}</span>
      )
    }
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin size="large" />
        <span className="ml-4 text-gray-600">Generating report...</span>
      </div>
    );
  }

  return (
    <div className="expense-report p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Reports</h1>
          <p className="text-gray-600">
            Analyze and track your spending patterns
          </p>
        </div>
        
        <Space>
          <Tooltip title="Export CSV">
            <Button 
              icon={<FileExcelOutlined />} 
              onClick={exportToCSV}
              className="text-green-600 border-green-200 hover:border-green-400"
            >
              Export CSV
            </Button>
          </Tooltip>
          <Tooltip title="Download Print Report">
            <Button 
              icon={<PrinterOutlined />} 
              onClick={printReport}
              type="primary"
            >
              Download Report
            </Button>
          </Tooltip>
        </Space>
      </div>

      {/* Filters */}
      <Card className="mb-6 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <RangePicker
              value={dateRange}
              onChange={setDateRange}
              className="w-full md:w-auto"
              format="DD MMM YYYY"
            />
          </div>
          
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <Select
              value={selectedCategory}
              onChange={setSelectedCategory}
              className="w-full"
              placeholder="All Categories"
            >
              <Option value="all">All Categories</Option>
              {categories.map(cat => (
                <Option key={cat.id} value={cat.id}>
                  <Space>
                    <span style={{ color: cat.color }}>{cat.icon}</span>
                    {cat.name}
                  </Space>
                </Option>
              ))}
            </Select>
          </div>
          
          <div className="flex items-end">
            <Button
              type="primary"
              icon={<FilterOutlined />}
              onClick={loadReportData}
            >
              Apply Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} sm={12} lg={6}>
          <Card className="shadow-sm">
            <Statistic
              title="Total Spent"
              value={summary.totalAmount}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#3f51b5' }}
              prefix={<DollarOutlined className="text-blue-500" />}
            />
            <div className="mt-2 text-sm text-gray-500">
              {summary.totalExpenses} expenses
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card className="shadow-sm">
            <Statistic
              title="Average Expense"
              value={summary.averageExpense}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#4caf50' }}
              prefix={<TransactionOutlined className="text-green-500" />}
            />
            <div className="mt-2 text-sm text-gray-500">
              Per transaction
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card className="shadow-sm">
            <Statistic
              title="Highest Expense"
              value={summary.highestExpense}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#f44336' }}
              prefix={<RiseOutlined className="text-red-500" />}
            />
            <div className="mt-2 text-sm text-gray-500">
              Largest single expense
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card className="shadow-sm">
            <Statistic
              title="Daily Average"
              value={summary.dailyAverage}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#ff9800' }}
              prefix={<CalendarOutlined className="text-orange-500" />}
            />
            <div className="mt-2 text-sm text-gray-500">
              Per day spending
            </div>
          </Card>
        </Col>
      </Row>

      {/* Category Breakdown */}
      <Card title="Category Breakdown" className="mb-6 shadow-sm">
        {categoryStats.length > 0 ? (
          <div className="space-y-4">
            {categoryStats.map((stat, index) => (
              <div key={stat.category.id || index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Space>
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: stat.category.color }}
                    />
                    <span className="font-medium">{stat.category.name}</span>
                    <Tag color={stat.category.color}>
                      {stat.category.icon}
                    </Tag>
                  </Space>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">
                      ₹{stat.amount.toLocaleString('en-IN', { 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2 
                      })}
                    </div>
                    <div className="text-sm text-gray-500">
                      {stat.count} expenses
                    </div>
                  </div>
                </div>
                <Progress
                  percent={stat.percentage.toFixed(1)}
                  strokeColor={stat.category.color}
                  showInfo={false}
                />
              </div>
            ))}
          </div>
        ) : (
          <Empty description="No data for selected filters" />
        )}
      </Card>

      {/* Monthly Trend */}
      <Card title="Last 6 Months Trend" className="mb-6 shadow-sm">
        {monthlyTrend.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Month</th>
                  <th className="text-right py-2 px-4">Amount</th>
                  <th className="text-right py-2 px-4">Transactions</th>
                  <th className="text-right py-2 px-4">Average</th>
                </tr>
              </thead>
              <tbody>
                {monthlyTrend.map((month, index) => (
                  <tr key={month.month} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                    <td className="py-2 px-4">
                      <span className="font-medium">
                        {dayjs(month.month).format('MMM YYYY')}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right font-bold">
                      ₹{month.amount.toLocaleString('en-IN', { 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2 
                      })}
                    </td>
                    <td className="py-2 px-4 text-right">
                      {month.count}
                    </td>
                    <td className="py-2 px-4 text-right">
                      ₹{(month.amount / (month.count || 1)).toLocaleString('en-IN', { 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2 
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty description="No monthly data available" />
        )}
      </Card>

      {/* Detailed Expense Table */}
      <Card 
        title={`Expense Details (${reportData.length} records)`} 
        className="shadow-sm"
        extra={
          <Space>
            <span className="text-gray-600 text-sm">
              Showing data from {dateRange[0]?.format('DD MMM YYYY')} to {dateRange[1]?.format('DD MMM YYYY')}
            </span>
          </Space>
        }
      >
        {reportData.length > 0 ? (
          <>
            <Table
              columns={columns}
              dataSource={reportData}
              rowKey="id"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} expenses`
              }}
              size="middle"
              scroll={{ x: 800 }}
            />
            
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-medium text-gray-700">Report Summary:</span>
                  <div className="text-sm text-gray-600 mt-1">
                    Period: {dateRange[0]?.format('DD MMM YYYY')} - {dateRange[1]?.format('DD MMM YYYY')}
                    {selectedCategory !== 'all' && ` | Category: ${categories.find(c => c.id === selectedCategory)?.name}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900">
                    ₹{summary.totalAmount.toLocaleString('en-IN', { 
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2 
                    })}
                  </div>
                  <div className="text-sm text-gray-600">
                    Total for {summary.totalExpenses} expenses
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <Empty
            description={
              <div className="text-center py-8">
                <p className="text-gray-600 mb-2">No expense data found</p>
                <p className="text-gray-500 text-sm">Try adjusting your filters</p>
              </div>
            }
          />
        )}
      </Card>

      {/* Print Styles */}
      <style jsx>{`
        @media print {
          .expense-report {
            padding: 0;
          }
          .ant-card {
            box-shadow: none !important;
            border: 1px solid #ddd !important;
            page-break-inside: avoid;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ExpenseReport;